-- Phase 8 (M1): legal document versioning, checkout acceptance, Botón de Arrepentimiento.
-- See docs delivered by the user: Política de Reembolsos v1.0, Términos y Condiciones del Comprador v1.0,
-- Política de Privacidad v1.0, Acuerdo y Términos para Organizadores v1.0 (Prompt Maestro governs implementation).
-- M1 only establishes legal eligibility for the arrepentimiento right; it does NOT execute any refund (see M2).

create type public.legal_document_type as enum ('terms_buyer', 'refund_policy', 'privacy_policy', 'organizer_agreement');
create type public.legal_document_status as enum ('draft', 'active', 'superseded');
create type public.legal_acceptance_source as enum ('checkout', 'producer_agreement', 'admin');
create type public.arrepentimiento_eligibility_status as enum ('PENDING', 'ELIGIBLE', 'INELIGIBLE', 'MANUAL_REVIEW');

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  type public.legal_document_type not null,
  version text not null check (char_length(version) between 1 and 20),
  effective_from timestamptz not null default now(),
  content_hash text not null,
  status public.legal_document_status not null default 'active',
  content text not null,
  created_at timestamptz not null default now()
);

create unique index legal_documents_active_unique on public.legal_documents (type) where status = 'active';

alter table public.legal_documents enable row level security;

create policy legal_documents_public_select on public.legal_documents
  for select to anon, authenticated
  using (status = 'active');

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  legal_document_id uuid not null references public.legal_documents(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  accepted_at timestamptz not null default now(),
  source public.legal_acceptance_source not null,
  metadata jsonb not null default '{}',
  check ((order_id is not null) <> (organization_id is not null))
);

create index legal_acceptances_order_idx on public.legal_acceptances (order_id) where order_id is not null;
create index legal_acceptances_organization_idx on public.legal_acceptances (organization_id) where organization_id is not null;

alter table public.legal_acceptances enable row level security;

create policy legal_acceptances_manager_select on public.legal_acceptances
  for select to authenticated
  using (
    (organization_id is not null and public.can_manage_org(organization_id))
    or (order_id is not null and exists (
      select 1 from public.orders o where o.id = legal_acceptances.order_id and public.can_manage_org(o.organization_id)
    ))
  );

create table public.arrepentimiento_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  requester_email text not null,
  eligibility_status public.arrepentimiento_eligibility_status not null default 'PENDING',
  ticket_ids uuid[] not null default '{}',
  ineligibility_reason text,
  management_code text not null unique check (management_code ~ '^ARP-[0-9A-Z]{6}$'),
  verification_token_hash text not null check (verification_token_hash ~ '^[0-9a-f]{64}$'),
  verification_expires_at timestamptz not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index arrepentimiento_requests_active_order_unique
  on public.arrepentimiento_requests (order_id) where eligibility_status = 'PENDING' and confirmed_at is null;

alter table public.arrepentimiento_requests enable row level security;

create policy arrepentimiento_requests_manager_select on public.arrepentimiento_requests
  for select to authenticated
  using (public.can_manage_org(organization_id));

-- Public read of the active legal document per type (terms/privacy/refund pages, checkout version display).
create or replace function public.get_active_legal_document(target_type public.legal_document_type)
returns public.legal_documents
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.legal_documents where type = target_type and status = 'active' limit 1;
$$;

revoke all on function public.get_active_legal_document(public.legal_document_type) from public, anon, authenticated;
grant execute on function public.get_active_legal_document(public.legal_document_type) to anon, authenticated;

-- Internal helper: applies Política de Reembolsos §1 (10 días corridos / 24hs antes del evento / no utilizado).
create or replace function public.compute_ticket_arrepentimiento_eligibility(target_ticket uuid)
returns table (eligible boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ticket_row public.tickets;
  event_row public.events;
  delivery_sent_at timestamptz;
  payment_approved_at timestamptz;
  order_created_at timestamptz;
  base_date timestamptz;
begin
  select * into ticket_row from public.tickets where id = target_ticket;
  if not found then return query select false, 'Entrada no encontrada'; return; end if;
  if ticket_row.status <> 'valid' or ticket_row.used_entries > 0 then
    return query select false, 'La entrada ya fue utilizada o ya no está activa.';
    return;
  end if;

  select * into event_row from public.events where id = ticket_row.event_id;

  select min(sent_at) into delivery_sent_at
  from public.ticket_deliveries where order_id = ticket_row.order_id and sent_at is not null;
  select min(approved_at) into payment_approved_at
  from public.payments where order_id = ticket_row.order_id and approved_at is not null;
  select created_at into order_created_at from public.orders where id = ticket_row.order_id;

  base_date := least(
    coalesce(delivery_sent_at, order_created_at),
    coalesce(payment_approved_at, order_created_at)
  );

  if now() > base_date + interval '10 days' then
    return query select false, 'Pasaron más de 10 días corridos desde que recibiste la entrada.';
    return;
  end if;
  if now() > event_row.starts_at - interval '24 hours' then
    return query select false, 'Faltan menos de 24 horas para el evento.';
    return;
  end if;

  return query select true, null::text;
end;
$$;

revoke all on function public.compute_ticket_arrepentimiento_eligibility(uuid) from public, anon, authenticated;

-- Checkout: require and record acceptance of the active Terms and Refund Policy versions atomically with the order.
create or replace function public.create_guest_checkout_internal(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb,
  accepted_terms_document_id uuid,
  accepted_refund_policy_document_id uuid
)
returns table (order_public_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  org_row public.organizations;
  customer_id uuid;
  order_id uuid;
  selection jsonb;
  selected_type public.order_item_type;
  selected_id uuid;
  type_row public.ticket_types;
  table_row public.event_tables;
  seat_row public.event_seats;
  seat_section_row public.seat_map_sections;
  requested integer;
  type_reserved bigint;
  event_reserved bigint;
  ticket_subtotal bigint := 0;
  table_subtotal bigint := 0;
  table_fee bigint := 0;
  seat_subtotal bigint := 0;
  seat_fee bigint := 0;
  subtotal bigint := 0;
  fee bigint := 0;
  expiry timestamptz := now() + interval '10 minutes';
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
  terms_doc public.legal_documents;
  refund_doc public.legal_documents;
begin
  select * into terms_doc from public.legal_documents
  where id = accepted_terms_document_id and type = 'terms_buyer' and status = 'active';
  if not found then raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = 'P0001'; end if;
  select * into refund_doc from public.legal_documents
  where id = accepted_refund_policy_document_id and type = 'refund_policy' and status = 'active';
  if not found then raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = 'P0001'; end if;

  if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) = 0
    or jsonb_array_length(selections) > 20 then
    raise exception 'EMPTY_SELECTION' using errcode = 'P0001';
  end if;
  if (
    select count(*) <> count(distinct (
      coalesce(selected_item->>'item_type', case when selected_item ? 'ticket_type_id' then 'ticket' else '' end)
      || ':' || coalesce(selected_item->>'item_id', selected_item->>'ticket_type_id', '')
    ))
    from jsonb_array_elements(selections) selected_item
  ) then
    raise exception 'DUPLICATE_SELECTION' using errcode = 'P0001';
  end if;
  if char_length(trim(buyer_first_name)) < 1
    or char_length(trim(buyer_last_name)) < 1
    or buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_BUYER' using errcode = 'P0001';
  end if;

  select * into event_row
  from public.events
  where id = target_event and status = 'published'
  for update;
  if not found then raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0001'; end if;
  if event_row.require_document and nullif(trim(buyer_document), '') is null then
    raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001';
  end if;
  select * into org_row from public.organizations where id = event_row.organization_id;

  update public.ticket_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.table_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.seat_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.orders o
  set status = 'expired'
  where o.event_id = target_event and o.status = 'pending' and o.expires_at <= now();

  select
    coalesce((
      select sum(h.quantity) from public.ticket_holds h
      where h.event_id = target_event
        and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()))
    ), 0)
    + coalesce((
      select sum(et.capacity)
      from public.table_holds h
      join public.event_tables et on et.id = h.event_table_id
      where h.event_id = target_event
        and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
    ), 0)
    + coalesce((
      select count(*)
      from public.seat_holds h
      where h.event_id = target_event
        and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
    ), 0)
  into event_reserved;

  for selection in
    select value from jsonb_array_elements(selections)
    order by coalesce(value->>'item_id', value->>'ticket_type_id')
  loop
    begin
      selected_type := coalesce(
        (selection->>'item_type')::public.order_item_type,
        case when selection ? 'ticket_type_id' then 'ticket'::public.order_item_type else null end
      );
      selected_id := coalesce(selection->>'item_id', selection->>'ticket_type_id')::uuid;
      requested := (selection->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_SELECTION' using errcode = 'P0001';
    end;

    if selected_type = 'ticket' then
      select * into type_row
      from public.ticket_types
      where id = selected_id and event_id = target_event and active and publicly_available
      for update;
      if not found or requested < 1 or requested > type_row.max_per_order then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if type_row.sales_start is not null and type_row.sales_start > now() then
        raise exception 'SALES_NOT_STARTED' using errcode = 'P0001';
      end if;
      if type_row.sales_end is not null and type_row.sales_end <= now() then
        raise exception 'SALES_ENDED' using errcode = 'P0001';
      end if;
      select coalesce(sum(h.quantity), 0) into type_reserved
      from public.ticket_holds h
      where h.ticket_type_id = type_row.id
        and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()));
      if type_reserved + requested > type_row.quantity then
        raise exception 'TICKET_TYPE_SOLD_OUT' using errcode = 'P0001';
      end if;
      if not exists (
        select 1 from public.get_public_ticket_types(target_event) public_type
        where public_type.id = type_row.id and public_type.sale_open
      ) then
        raise exception 'TICKET_TYPE_NOT_OPEN' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + requested;
      ticket_subtotal := ticket_subtotal + type_row.price_amount * requested;
    elsif selected_type = 'table' then
      select * into table_row
      from public.event_tables
      where id = selected_id and event_id = target_event and active
      for update;
      if not found or requested <> 1 then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.table_holds h
        where h.event_table_id = table_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ) then
        raise exception 'TABLE_UNAVAILABLE' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + table_row.capacity;
      table_subtotal := table_subtotal + table_row.base_price_amount;
      table_fee := table_fee + round(
        table_row.base_price_amount
        * coalesce(table_row.service_fee_bps, org_row.table_service_fee_bps, org_row.service_fee_bps)::numeric
        / 10000
      )::bigint;
    elsif selected_type = 'seat' then
      select * into seat_row
      from public.event_seats
      where id = selected_id and event_id = target_event and active
      for update;
      if not found or requested <> 1 then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      select * into seat_section_row from public.seat_map_sections where id = seat_row.section_id and active;
      if not found then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.seat_holds h
        where h.event_seat_id = seat_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ) then
        raise exception 'SEAT_UNAVAILABLE' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + 1;
      seat_subtotal := seat_subtotal + seat_section_row.base_price_amount;
      seat_fee := seat_fee + round(
        seat_section_row.base_price_amount
        * coalesce(seat_section_row.service_fee_bps, org_row.table_service_fee_bps, org_row.service_fee_bps)::numeric
        / 10000
      )::bigint;
    else
      raise exception 'INVALID_SELECTION' using errcode = 'P0001';
    end if;
    if event_reserved > event_row.capacity then
      raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001';
    end if;
  end loop;

  subtotal := ticket_subtotal + table_subtotal + seat_subtotal;
  if org_row.fee_payer = 'buyer' then
    fee := round(ticket_subtotal * org_row.service_fee_bps::numeric / 10000)::bigint + table_fee + seat_fee;
  end if;

  insert into public.customers (
    organization_id, first_name, last_name, email, phone, document
  ) values (
    event_row.organization_id, trim(buyer_first_name), trim(buyer_last_name),
    lower(trim(buyer_email)), nullif(trim(buyer_phone), ''), nullif(trim(buyer_document), '')
  )
  on conflict (organization_id, lower(email)) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = coalesce(excluded.phone, public.customers.phone),
      document = coalesce(excluded.document, public.customers.document)
  returning id into customer_id;

  insert into public.orders (
    public_id, organization_id, event_id, customer_id,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id,
    subtotal, fee, subtotal + fee, event_row.currency, expiry
  ) returning id into order_id;

  insert into public.legal_acceptances (legal_document_id, order_id, email, source)
  values
    (terms_doc.id, order_id, lower(trim(buyer_email)), 'checkout'),
    (refund_doc.id, order_id, lower(trim(buyer_email)), 'checkout');

  for selection in
    select value from jsonb_array_elements(selections)
    order by coalesce(value->>'item_id', value->>'ticket_type_id')
  loop
    selected_type := coalesce(
      (selection->>'item_type')::public.order_item_type,
      case when selection ? 'ticket_type_id' then 'ticket'::public.order_item_type else null end
    );
    selected_id := coalesce(selection->>'item_id', selection->>'ticket_type_id')::uuid;
    requested := (selection->>'quantity')::integer;
    if selected_type = 'ticket' then
      select * into type_row from public.ticket_types where id = selected_id;
      insert into public.order_items (
        organization_id, order_id, item_type, ticket_type_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'ticket', type_row.id, type_row.name,
        requested, type_row.price_amount, type_row.price_amount * requested, type_row.currency
      );
      insert into public.ticket_holds (
        organization_id, event_id, ticket_type_id, order_id, quantity, expires_at
      ) values (
        event_row.organization_id, target_event, type_row.id, order_id, requested, expiry
      );
    elsif selected_type = 'table' then
      select * into table_row from public.event_tables where id = selected_id;
      insert into public.order_items (
        organization_id, order_id, item_type, event_table_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'table', table_row.id, table_row.name,
        1, table_row.base_price_amount, table_row.base_price_amount, table_row.currency
      );
      insert into public.table_holds (
        organization_id, event_id, event_table_id, order_id, expires_at
      ) values (
        event_row.organization_id, target_event, table_row.id, order_id, expiry
      );
    else
      select * into seat_row from public.event_seats where id = selected_id;
      select * into seat_section_row from public.seat_map_sections where id = seat_row.section_id;
      insert into public.order_items (
        organization_id, order_id, item_type, event_seat_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'seat', seat_row.id,
        seat_section_row.name || ' · ' || seat_row.label,
        1, seat_section_row.base_price_amount, seat_section_row.base_price_amount, seat_section_row.currency
      );
      insert into public.seat_holds (
        organization_id, event_id, event_seat_id, order_id, expires_at
      ) values (
        event_row.organization_id, target_event, seat_row.id, order_id, expiry
      );
    end if;
  end loop;

  return query select generated_public_id, expiry;
end;
$$;

revoke all on function public.create_guest_checkout_internal(uuid, text, text, text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_guest_checkout(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb,
  accepted_terms_document_id uuid,
  accepted_refund_policy_document_id uuid
)
returns table (order_public_id text, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select * from public.create_guest_checkout_internal(
    target_event, buyer_first_name, buyer_last_name, buyer_email,
    buyer_phone, buyer_document, selections,
    accepted_terms_document_id, accepted_refund_policy_document_id
  );
$$;

create or replace function public.create_guest_checkout_attributed(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb,
  target_attribution_session_hash text,
  accepted_terms_document_id uuid,
  accepted_refund_policy_document_id uuid
)
returns table (order_public_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_order_public_id text;
  generated_expiry timestamptz;
  attribution_event_promoter_id uuid;
  attribution_promoter_id uuid;
  attributed_order public.orders;
begin
  select checkout.order_public_id, checkout.expires_at
  into generated_order_public_id, generated_expiry
  from public.create_guest_checkout_internal(
    target_event, buyer_first_name, buyer_last_name, buyer_email,
    buyer_phone, buyer_document, selections,
    accepted_terms_document_id, accepted_refund_policy_document_id
  ) checkout;

  if target_attribution_session_hash ~ '^[0-9a-f]{64}$' then
    select active.event_promoter_id, active.promoter_id
    into attribution_event_promoter_id, attribution_promoter_id
    from public.get_active_promoter_attribution(target_event, target_attribution_session_hash) active;
  end if;
  if attribution_event_promoter_id is not null then
    update public.orders
    set event_promoter_id = attribution_event_promoter_id,
        promoter_id = attribution_promoter_id
    where public_id = generated_order_public_id
    returning * into attributed_order;
    insert into public.audit_logs (
      organization_id, action, entity_type, entity_id, after_data
    ) values (
      attributed_order.organization_id, 'promoter.attribution.created',
      'order', attributed_order.id,
      jsonb_build_object(
        'event_promoter_id', attribution_event_promoter_id,
        'promoter_id', attribution_promoter_id
      )
    );
  end if;
  return query select generated_order_public_id, generated_expiry;
end;
$$;

revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb, uuid, uuid) to anon, authenticated;
revoke all on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to anon, authenticated;

-- Botón de Arrepentimiento: step 1 (identify + verify), enumeration-safe.
create or replace function public.start_arrepentimiento_request(
  order_public_id text,
  requester_email text,
  verification_token_hash text,
  verification_expires_at timestamptz
)
returns table (matched boolean, management_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  normalized_email text := lower(trim(requester_email));
  generated_code text;
  ticket_id_list uuid[];
  computed_eligible boolean := true;
  computed_reason text;
  ticket_id uuid;
  ticket_eligible boolean;
  ticket_reason text;
  existing_request public.arrepentimiento_requests;
begin
  select o.* into order_row
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.public_id = order_public_id and o.status = 'paid' and lower(c.email) = normalized_email;

  if not found then
    return query select false, null::text;
    return;
  end if;

  select array_agg(t.id) into ticket_id_list from public.tickets t where t.order_id = order_row.id;
  if ticket_id_list is null or array_length(ticket_id_list, 1) is null then
    return query select false, null::text;
    return;
  end if;

  foreach ticket_id in array ticket_id_list loop
    select eligible, reason into ticket_eligible, ticket_reason
    from public.compute_ticket_arrepentimiento_eligibility(ticket_id);
    if not ticket_eligible then
      computed_eligible := false;
      computed_reason := coalesce(computed_reason, ticket_reason);
    end if;
  end loop;

  select * into existing_request from public.arrepentimiento_requests
  where order_id = order_row.id and eligibility_status = 'PENDING' and confirmed_at is null;

  if found then
    generated_code := existing_request.management_code;
    update public.arrepentimiento_requests
    set verification_token_hash = start_arrepentimiento_request.verification_token_hash,
        verification_expires_at = start_arrepentimiento_request.verification_expires_at,
        eligibility_status = case when computed_eligible then 'PENDING'::public.arrepentimiento_eligibility_status else 'PENDING'::public.arrepentimiento_eligibility_status end,
        ineligibility_reason = computed_reason
    where id = existing_request.id;
  else
    generated_code := 'ARP-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6));
    insert into public.arrepentimiento_requests (
      organization_id, order_id, requester_email, eligibility_status, ticket_ids,
      ineligibility_reason, management_code, verification_token_hash, verification_expires_at
    ) values (
      order_row.organization_id, order_row.id, normalized_email, 'PENDING', ticket_id_list,
      computed_reason, generated_code, start_arrepentimiento_request.verification_token_hash,
      start_arrepentimiento_request.verification_expires_at
    );
  end if;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, 'arrepentimiento.requested', 'order', order_row.id,
    jsonb_build_object('eligible', computed_eligible, 'management_code', generated_code));

  return query select true, generated_code;
end;
$$;

revoke all on function public.start_arrepentimiento_request(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.start_arrepentimiento_request(text, text, text, timestamptz) to anon, authenticated;

-- Botón de Arrepentimiento: step 2 (confirm via emailed token, finalize eligibility).
create or replace function public.confirm_arrepentimiento_request(raw_token text)
returns table (eligibility_status public.arrepentimiento_eligibility_status, management_code text, ineligibility_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.arrepentimiento_requests;
  token_hash text := encode(extensions.digest(raw_token, 'sha256'), 'hex');
  final_status public.arrepentimiento_eligibility_status;
begin
  select * into request_row from public.arrepentimiento_requests
  where verification_token_hash = token_hash and confirmed_at is null and verification_expires_at > now();
  if not found then
    raise exception 'ARREPENTIMIENTO_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  final_status := case when request_row.ineligibility_reason is null then 'ELIGIBLE' else 'INELIGIBLE' end;

  update public.arrepentimiento_requests
  set confirmed_at = now(), eligibility_status = final_status
  where id = request_row.id;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (request_row.organization_id, 'arrepentimiento.confirmed', 'order', request_row.order_id,
    jsonb_build_object('eligibility_status', final_status, 'management_code', request_row.management_code));

  return query select final_status, request_row.management_code, request_row.ineligibility_reason;
end;
$$;

revoke all on function public.confirm_arrepentimiento_request(text) from public, anon, authenticated;
grant execute on function public.confirm_arrepentimiento_request(text) to anon, authenticated;

-- Seed: the 4 legal documents at v1.0, content copied verbatim from the source Markdown (placeholders kept as-is).
-- Each insert defines its content once (via the VALUES subquery) and derives type/hash from it, to avoid duplication.
insert into public.legal_documents (type, version, content_hash, status, content)
select 'refund_policy', '1.0', encode(extensions.digest(doc.content, 'sha256'), 'hex'), 'active', doc.content
from (values ($refund_v1$# Política de Reembolsos de ENPASS

**Versión 1.0 - Septiembre de 2026**

Esta Política de Reembolsos establece las condiciones aplicables a las entradas adquiridas a través de ENPASS.

ENPASS es una plataforma tecnológica que facilita la publicación, comercialización, gestión, pago y acceso a eventos organizados por terceros.

El productor, organizador, establecimiento, club o responsable identificado en cada evento -en adelante, el **Organizador**- es responsable de la realización y condiciones particulares del evento.

ENPASS gestiona las solicitudes de reembolso realizadas a través de su plataforma conforme a esta política, las condiciones particulares de cada evento y la legislación aplicable.

## 1. Derecho de arrepentimiento

Cuando una entrada haya sido adquirida a través de ENPASS, el comprador podrá ejercer el derecho de arrepentimiento dentro de los **diez (10) días corridos** desde la recepción de la entrada o del comprobante de pago, lo que ocurra primero.

Para entradas correspondientes a espectáculos, eventos deportivos o artísticos, la solicitud deberá realizarse con una anticipación mínima de **veinticuatro (24) horas respecto del comienzo del evento**.

Cuando se cumplan estas condiciones, el comprador podrá recibir el reintegro del **total efectivamente abonado por las entradas alcanzadas por la solicitud**, incluidos los cargos de servicio correspondientes.

Una entrada que ya haya sido utilizada para acceder al evento no podrá ser posteriormente reembolsada mediante el derecho de arrepentimiento.

## 2. Botón de Arrepentimiento

ENPASS pondrá a disposición del comprador un **Botón de Arrepentimiento** visible y de fácil acceso dentro de la plataforma.

No será necesario iniciar sesión para comenzar una solicitud mediante este mecanismo.

ENPASS podrá solicitar pasos razonables destinados exclusivamente a:

- identificar la operación;
- verificar la identidad del comprador;
- validar que la solicitud provenga del titular correspondiente;
- prevenir solicitudes fraudulentas.

Una vez registrada correctamente la solicitud, ENPASS proporcionará una constancia o código identificatorio de la gestión.

## 3. Cancelación del evento

Cuando un evento sea cancelado definitivamente, las entradas adquiridas a través de ENPASS serán elegibles para devolución.

Como política general de ENPASS, el comprador recibirá el **total efectivamente abonado por la compra afectada**, incluido el cargo de servicio de ENPASS correspondiente a las entradas reembolsadas.

Siempre que la infraestructura de pagos y las circunstancias del evento lo permitan, ENPASS podrá iniciar estos reembolsos automáticamente sin exigir que cada comprador presente una solicitud individual.

Una vez iniciado el reembolso, las entradas afectadas quedarán invalidadas y no podrán utilizarse.

La responsabilidad por la cancelación, realización y demás obligaciones relativas al evento corresponde al Organizador, sin perjuicio de la gestión de devolución que ENPASS pueda realizar frente al comprador.

## 4. Reprogramación

Cuando un evento cambie de fecha, las entradas adquiridas originalmente **continuarán siendo válidas para la nueva fecha**, salvo comunicación expresa en contrario.

El comprador no tendrá que generar una nueva entrada.

Cuando corresponda, ENPASS informará al comprador mediante correo electrónico y/o dentro de la plataforma:

- la nueva fecha;
- las condiciones de la reprogramación;
- la posibilidad de conservar su entrada;
- la posibilidad de solicitar un reembolso;
- el plazo y procedimiento para hacerlo.

Si el comprador decide conservar la entrada, no deberá realizar ninguna acción adicional.

Si opta por la devolución dentro de las condiciones aplicables, recibirá el total correspondiente a las entradas devueltas, incluidos los cargos de servicio asociados.

La entrada reembolsada quedará inmediatamente invalidada.

## 5. Modificaciones sustanciales

Determinadas modificaciones relevantes podrán ser tratadas de manera equivalente a una reprogramación.

Entre ellas podrán encontrarse:

- cambio de ciudad;
- cambio significativo de establecimiento o sede;
- cambio esencial en las características bajo las cuales fue comercializado el evento;
- modificaciones que alteren sustancialmente el servicio originalmente adquirido.

Los cambios menores de horario, accesos, programación, distribución interna, artistas secundarios u otras cuestiones operativas no generarán automáticamente derecho a devolución, salvo que la legislación, el Organizador o las condiciones particulares del evento establezcan lo contrario.

## 6. Imposibilidad personal de asistir

Fuera del derecho de arrepentimiento y de los demás casos previstos en esta política, la imposibilidad personal del comprador de asistir al evento no genera automáticamente derecho a devolución.

Esto incluye, entre otros casos:

- cambios de planes;
- viajes;
- compromisos personales;
- errores al seleccionar fecha o sector;
- no presentación al evento.

El Organizador podrá establecer voluntariamente políticas más flexibles para determinados eventos.

Cuando una devolución sea otorgada voluntariamente fuera de los casos obligatorios previstos en esta política, sus condiciones específicas -incluida la devolución o no de cargos de servicio- podrán ser determinadas por el Organizador y deberán ser informadas al comprador.

## 7. Compras duplicadas o errores de operación

Cuando el comprador considere que se produjo una compra duplicada por un error técnico o de procesamiento, podrá solicitar una revisión.

ENPASS verificará:

- fecha y hora de las operaciones;
- medio de pago;
- entradas involucradas;
- identidad del comprador;
- registros técnicos disponibles.

La presentación de una solicitud no implica automáticamente su aprobación.

Cuando ENPASS compruebe razonablemente la existencia de una operación duplicada involuntaria, podrá proceder al reembolso de la operación o entradas duplicadas correspondientes.

## 8. Reembolsos parciales

Cuando una misma compra incluya varias entradas independientes, ENPASS podrá procesar el reembolso de una o más entradas sin necesariamente cancelar la totalidad de la orden, siempre que el motivo del reembolso y la normativa aplicable permitan hacerlo.

Ejemplo: una compra contiene cuatro entradas y corresponde devolver una. La entrada reembolsada quedará invalidada, mientras que las otras tres podrán continuar vigentes.

El importe a devolver será calculado en función de las entradas alcanzadas y de los cargos asociados a ellas.

## 9. Entradas utilizadas

Una entrada registrada como utilizada mediante los sistemas de acceso de ENPASS se considera consumida a los efectos del derecho de arrepentimiento.

La utilización de la entrada no limita otros reclamos que legalmente pudieran corresponder cuando existan incumplimientos en la prestación efectiva del evento o del servicio contratado.

ENPASS conservará registros de validación de accesos para la gestión de reclamos, prevención de fraude y resolución de disputas.

## 10. Entradas transferidas

Cuando ENPASS permita transferir una entrada a otro usuario, la transferencia no modifica necesariamente al titular original de la operación de pago.

En caso de devolución:

1. el reembolso se procesará, como regla general, hacia el medio de pago utilizado para realizar la compra original;
2. la entrada transferida quedará invalidada;
3. el usuario que hubiera recibido la entrada ya no podrá utilizarla;
4. ENPASS podrá informar a las partes involucradas acerca de la cancelación de la entrada.

## 11. Forma de devolución

Siempre que sea técnicamente posible, ENPASS realizará el reembolso utilizando el mismo medio empleado para efectuar el pago original.

El comprador podrá visualizar estados como: **Solicitud recibida**, **En revisión**, **Reembolso aprobado**, **Reembolso en proceso** y **Reembolsado**.

Una vez que ENPASS procese correctamente una devolución, el tiempo hasta que el dinero aparezca acreditado podrá variar según Mercado Pago, la tarjeta, la entidad financiera o el medio de pago utilizado.

Estos tiempos externos no son controlados directamente por ENPASS.

Cuando una devolución no pueda realizarse técnicamente mediante el método original, ENPASS podrá establecer un procedimiento alternativo seguro.

## 12. Pagos mediante transferencia

Cuando una compra se haya realizado mediante transferencia bancaria u otro mecanismo sin reversión automática, ENPASS podrá solicitar información adicional para procesar el reintegro.

Podrán requerirse datos de identificación del comprador y de la cuenta receptora.

ENPASS podrá verificar que dichos datos correspondan legítimamente al comprador antes de efectuar el reintegro.

## 13. Contracargos y desconocimientos

Un reembolso solicitado ante ENPASS y un desconocimiento o contracargo presentado ante una entidad financiera son procedimientos diferentes.

Si sobre una misma operación existe simultáneamente una solicitud de reembolso y un contracargo o desconocimiento activo, ENPASS podrá detener temporalmente el procesamiento de la devolución hasta determinar el estado de la disputa y evitar una devolución duplicada.

ENPASS podrá presentar ante el procesador de pagos documentación relacionada con la operación, emisión de entradas, comunicaciones y registros de acceso cuando resulte necesario responder a una disputa.

## 14. Prevención de fraude

ENPASS podrá someter una solicitud a revisión manual cuando existan indicios razonables de fraude, apropiación de una cuenta, manipulación de entradas, utilización previa de un QR, solicitudes duplicadas, documentación inconsistente o intento de obtener más de un reintegro sobre la misma operación.

Durante la revisión, ENPASS podrá bloquear temporalmente las entradas afectadas para impedir su utilización.

Las medidas de prevención de fraude no podrán utilizarse para restringir derechos obligatorios reconocidos al consumidor.

## 15. Entradas gratuitas y cortesías

Cuando una entrada haya sido emitida gratuitamente y el comprador no haya abonado ningún importe, no existirá monto a reembolsar.

Si una cortesía hubiera generado cargos efectivamente abonados, dichos conceptos serán analizados conforme al motivo de la devolución y a las condiciones bajo las cuales fueron contratados.

## 16. Eventos con políticas especiales

Un Organizador podrá ofrecer condiciones de cambios y devoluciones más favorables que las previstas en esta política.

Estas condiciones deberán informarse al comprador antes de finalizar la compra.

Ninguna política particular de un evento podrá eliminar o restringir derechos irrenunciables reconocidos por la legislación aplicable.

## 17. Responsabilidad del Organizador

El Organizador es responsable, entre otras cuestiones, de realizar el evento, establecer su programación, determinar fecha y lugar, disponer las condiciones de acceso, gestionar la seguridad y operación del establecimiento, informar modificaciones y afrontar las consecuencias derivadas de la cancelación o incumplimiento del evento cuando corresponda.

ENPASS podrá gestionar frente al comprador los reembolsos derivados de estas circunstancias sin que ello implique asumir la calidad de organizador del evento.

## 18. Cómo solicitar un reembolso

Cuando una entrada sea elegible, el comprador podrá iniciar la solicitud desde **Mis entradas -> Compra -> Solicitar reembolso** o mediante los mecanismos públicos habilitados por ENPASS.

Para ejercer específicamente el derecho de arrepentimiento estará disponible también el **Botón de Arrepentimiento**.

Antes de confirmar una devolución, ENPASS informará siempre que sea posible qué entradas serán canceladas, el motivo, el importe a devolver, el medio estimado de devolución y las consecuencias de confirmar la solicitud.

Una vez confirmado y procesado el reembolso, la operación no podrá revertirse y las entradas afectadas dejarán de ser válidas.

## 19. Comunicación

ENPASS enviará las comunicaciones relacionadas con solicitudes, reprogramaciones, cancelaciones y devoluciones al correo electrónico asociado a la compra y podrá asimismo mostrarlas dentro de la plataforma.

Es responsabilidad del comprador proporcionar información de contacto válida al realizar la operación.

## 20. Legislación aplicable

Esta Política de Reembolsos se interpreta conjuntamente con los Términos y Condiciones de ENPASS, las condiciones particulares del evento y la legislación argentina vigente.

Cuando cualquier disposición de esta política resulte menos favorable que un derecho obligatorio reconocido al consumidor por la normativa aplicable, prevalecerá la normativa correspondiente.

---

**ENPASS - Entradas simples. Experiencias sin vueltas.**
$refund_v1$)) as doc(content);

insert into public.legal_documents (type, version, content_hash, status, content)
select 'terms_buyer', '1.0', encode(extensions.digest(doc.content, 'sha256'), 'hex'), 'active', doc.content
from (values ($terms_v1$# Términos y Condiciones de Uso y Compra de ENPASS

**Versión 1.0 - Septiembre de 2026**

Los presentes Términos y Condiciones regulan el acceso, navegación y utilización de ENPASS, así como la adquisición, recepción, transferencia y utilización de entradas comercializadas a través de la plataforma.

ENPASS es operada por **[RAZÓN SOCIAL]**, CUIT **[●]**, con domicilio en **[●]**, República Argentina, en adelante, **"ENPASS"**.

Al utilizar ENPASS y/o realizar una compra, el usuario declara haber leído y aceptado estos Términos y Condiciones, la Política de Reembolsos, la Política de Privacidad y las condiciones particulares informadas para el evento correspondiente.

## 1. Definiciones

**ENPASS:** la plataforma tecnológica mediante la cual se publican, comercializan, gestionan y validan entradas para eventos organizados por terceros.

**Organizador:** la persona humana o jurídica responsable de producir, organizar o explotar el evento publicado.

**Comprador:** la persona que realiza una compra mediante ENPASS.

**Asistente o Holder:** la persona que posee legítimamente una entrada válida para acceder a un evento.

**Entrada o Ticket:** el derecho de acceso adquirido o emitido a través de ENPASS, representado mediante un código QR, credencial digital u otro mecanismo autorizado.

**Evento:** el espectáculo, fiesta, recital, actividad cultural, deportiva, empresarial, gastronómica, recreativa o de otra naturaleza publicado mediante ENPASS.

**Cargo de Servicio:** importe correspondiente a los servicios tecnológicos, operativos y/o administrativos prestados mediante ENPASS.

**Orden:** conjunto de una o más entradas adquiridas dentro de una misma operación.

## 2. Servicio prestado por ENPASS

ENPASS proporciona una infraestructura tecnológica destinada, entre otras funciones, a publicar y descubrir eventos, procesar reservas y compras, gestionar pagos, emitir y administrar entradas digitales, facilitar transferencias autorizadas, gestionar comunicaciones, procesar solicitudes de reembolso, validar accesos mediante QR u otros mecanismos y brindar herramientas tecnológicas a Organizadores.

ENPASS no produce ni organiza los eventos publicados por terceros, salvo que en un caso concreto sea expresamente identificado también como Organizador.

La utilización de ENPASS como plataforma no modifica la responsabilidad que corresponde al Organizador respecto de la realización y condiciones del Evento.

Cada parte responderá por las obligaciones que le correspondan conforme al servicio efectivamente prestado y a la legislación aplicable.

## 3. Responsabilidad del Organizador

El Organizador es responsable, entre otras cuestiones, de realizar el Evento, establecer fecha, horario y lugar, determinar programación y contenido, obtener las habilitaciones que correspondan, determinar aforo y sectores, establecer condiciones objetivas de admisión, gestionar la seguridad del establecimiento, informar restricciones de edad, comunicar requisitos particulares de ingreso, determinar disponibilidad y características de entradas, informar correctamente las características esenciales del Evento y responder por cancelaciones, suspensiones, reprogramaciones o modificaciones que le resulten imputables.

La identidad del Organizador deberá estar disponible en la información correspondiente al Evento cuando resulte legalmente exigible.

ENPASS podrá gestionar comunicaciones, pagos, reembolsos u otras operaciones en representación o por cuenta del Organizador sin asumir por ello la condición de Organizador del Evento.

## 4. Condiciones particulares de cada Evento

Cada Evento podrá establecer condiciones adicionales relacionadas con edad mínima, documentación requerida, horarios, sectores, ubicaciones, código de vestimenta cuando resulte legalmente válido, alimentos o elementos permitidos, modalidad de acceso, cantidad máxima de entradas por comprador, transferibilidad, políticas especiales más favorables de cambios o devoluciones y otras características particulares del Evento.

El Comprador deberá revisar estas condiciones antes de confirmar la operación.

Ninguna condición particular podrá eliminar o restringir derechos irrenunciables reconocidos por la normativa aplicable.

## 5. Información previa a la compra

Antes de confirmar una compra, ENPASS mostrará la información disponible correspondiente a la operación, incluyendo cuando resulte aplicable: Evento, fecha y horario, ubicación, tipo de entrada, sector, cantidad, precio, Cargo de Servicio, descuentos aplicados, otros cargos, importe final a pagar y medio de pago.

El Comprador deberá revisar esta información antes de confirmar el pago.

Los errores voluntarios o involuntarios del Comprador al seleccionar fecha, cantidad, sector o tipo de entrada no generan automáticamente derecho a cambio o devolución, sin perjuicio del derecho de arrepentimiento y de los demás derechos previstos legalmente.

## 6. Precios y Cargo de Servicio

Las entradas podrán incluir un Cargo de Servicio de ENPASS, que será informado antes de finalizar la compra.

El Comprador deberá poder conocer el importe final de la operación antes de confirmar el pago.

El Cargo de Servicio constituye la contraprestación correspondiente a los servicios tecnológicos y operativos proporcionados mediante ENPASS.

Su tratamiento ante devoluciones se regirá por la Política de Reembolsos vigente y la legislación aplicable.

Cuando corresponda legalmente o conforme a la Política de Reembolsos la devolución total de una operación, el Cargo de Servicio alcanzado será también reintegrado.

En devoluciones otorgadas voluntariamente fuera de los supuestos obligatorios, podrán establecerse condiciones diferentes informadas previamente.

## 7. Promociones y descuentos

ENPASS o el Organizador podrán ofrecer códigos promocionales, preventas, descuentos, promociones, beneficios especiales, precios por etapas, precios exclusivos y cupos limitados.

Estos beneficios podrán encontrarse sujetos a condiciones particulares.

Un código promocional no tiene valor monetario independiente y no podrá cambiarse por dinero.

La finalización de una promoción no genera derecho a exigir su extensión.

## 8. Disponibilidad y holds

La visualización de una entrada como disponible no implica que permanezca reservada indefinidamente.

ENPASS podrá utilizar mecanismos temporales de reserva o **hold** durante el proceso de compra.

Mientras exista un hold válido, determinadas entradas o ubicaciones podrán quedar temporalmente apartadas.

Si el comprador no completa el pago, abandona el proceso, el pago resulta rechazado o vence el tiempo de reserva, el hold podrá expirar automáticamente y las entradas podrán volver a ponerse a la venta.

La existencia de un hold no constituye por sí misma una compra.

## 9. Confirmación de la compra

La compra se considerará confirmada cuando el medio de pago haya sido aprobado cuando corresponda y ENPASS haya registrado correctamente la operación y emitido la correspondiente confirmación.

ENPASS enviará la confirmación mediante correo electrónico y/o la pondrá a disposición del Comprador dentro de la plataforma.

Un intento de pago rechazado, pendiente, incompleto o abandonado no garantiza la disponibilidad posterior de las entradas.

## 10. Procesamiento de pagos

ENPASS podrá utilizar procesadores de pago externos, incluyendo Mercado Pago, bancos, adquirentes u otros proveedores habilitados.

La utilización de estos medios podrá estar sujeta adicionalmente a sus propios términos y condiciones.

Los pagos podrán encontrarse sujetos a autorización, controles antifraude, límites, verificación del titular, validaciones del procesador y políticas de las entidades emisoras.

ENPASS no controla las decisiones independientes de aprobación o rechazo adoptadas por entidades financieras o procesadores externos. Esto no afecta las obligaciones que correspondan a ENPASS respecto de su propia plataforma.

## 11. Facturación y comprobantes

Las facturas, recibos o comprobantes correspondientes a cada concepto de la operación serán emitidos por la parte que resulte legalmente obligada a hacerlo.

ENPASS podrá facilitar tecnológicamente su emisión, disponibilidad o envío.

La existencia de más de un prestador dentro de una operación podrá implicar la emisión de comprobantes separados cuando corresponda legal o fiscalmente.

## 12. Emisión de entradas

Una vez confirmada la operación, las entradas serán enviadas al correo informado, puestas a disposición en "Mis entradas" y/o entregadas mediante cualquier otro mecanismo expresamente indicado.

Cada entrada contará con una identificación única dentro de ENPASS.

Una captura de pantalla, copia, impresión o reproducción de un QR no crea una entrada adicional ni modifica la titularidad existente en el sistema.

## 13. Validez del QR

El QR y los demás mecanismos de acceso representan una credencial vinculada a una entrada almacenada en ENPASS.

La validez de una entrada será determinada por el estado registrado en los sistemas de ENPASS al momento de la validación.

Una entrada podrá encontrarse, entre otros estados, válida, utilizada, transferida, bloqueada, cancelada, reembolsada o anulada.

Una entrada utilizada, cancelada, anulada o reembolsada no será válida para ingresar nuevamente.

## 14. Duplicación de entradas

El Comprador y el Asistente son responsables de proteger sus entradas y evitar compartir indebidamente códigos QR, enlaces de acceso o credenciales.

Si un código fuese copiado o compartido, la mera posesión de una imagen del QR no garantiza el derecho de acceso.

ENPASS utilizará el estado central de la entrada para determinar su validez.

Una vez registrado válidamente un acceso, los intentos posteriores de utilizar la misma entrada podrán ser rechazados.

## 15. Accesos múltiples y control de puertas

Los sistemas de ENPASS pueden operar simultáneamente desde distintos dispositivos y puntos de acceso.

La validación de una entrada en un punto deberá reflejarse en los demás sistemas de acceso conectados.

La utilización válida de una entrada en una puerta impedirá su reutilización posterior en otra, salvo que el Evento permita expresamente múltiples accesos.

## 16. Entradas grupales

Determinados Eventos podrán permitir que una misma compra o credencial represente varias entradas.

En estos casos, ENPASS podrá registrar individualmente los accesos consumidos. Por ejemplo: **3 de 8 accesos utilizados**.

La cantidad restante será determinada por el estado registrado en ENPASS.

## 17. Transferencia de entradas

Cuando el Organizador habilite esta funcionalidad, el Comprador podrá transferir una entrada mediante las herramientas oficiales de ENPASS.

La transferencia no constituye una nueva venta, no modifica automáticamente al titular del pago original, no implica un reembolso y deberá realizarse mediante los mecanismos habilitados.

El usuario receptor podrá pasar a ser el Holder de la entrada.

El historial de titularidad podrá conservarse por razones operativas, de seguridad, antifraude y auditoría.

## 18. Revocación de una transferencia

Una transferencia podrá quedar sin efecto cuando la entrada sea reembolsada, la operación original sea anulada, exista un fraude comprobado, se resuelva un contracargo, corresponda legalmente o las condiciones particulares del Evento permitan una revocación.

La eventual devolución económica se realizará conforme a la operación de compra original y no necesariamente a quien tenga la entrada transferida en ese momento.

## 19. Reventa

Salvo que exista una funcionalidad oficial de reventa expresamente habilitada, las entradas no podrán utilizarse con fines profesionales o comerciales de reventa no autorizada.

ENPASS y/o el Organizador podrán adoptar medidas razonables frente a operaciones que presenten indicios de reventa organizada no autorizada, fraude, utilización automatizada de sistemas, acaparamiento de entradas o incumplimiento de límites de compra.

Cualquier cancelación deberá respetar la normativa aplicable y los derechos del consumidor de buena fe.

## 20. Límites de compra

El Organizador podrá establecer un máximo de entradas por persona, cuenta, documento, medio de pago, Evento, preventa o transacción.

Los límites serán informados cuando corresponda.

ENPASS podrá revisar operaciones destinadas a evadir deliberadamente estos límites.

## 21. Acceso al Evento

Para ingresar, el Asistente deberá presentar una entrada válida y cumplir las condiciones objetivas de acceso previamente informadas.

El Organizador podrá solicitar documentación de identidad cuando resulte necesaria para verificar edad, comprobar titularidad, validar beneficios especiales o aplicar condiciones legalmente permitidas de acceso.

Cuando un requisito esencial haya sido informado de manera clara antes de la compra, su incumplimiento imputable exclusivamente al Asistente no generará automáticamente derecho a devolución.

## 22. Derecho de admisión y permanencia

El derecho de admisión y permanencia corresponde al titular u Organizador del establecimiento o Evento y deberá ejercerse conforme a la legislación vigente.

Las condiciones deberán ser objetivas, razonables, previamente informadas cuando corresponda y aplicadas de manera no discriminatoria.

ENPASS no autoriza prácticas arbitrarias o discriminatorias.

La negativa de acceso deberá ajustarse a la normativa aplicable.

## 23. Seguridad dentro del Evento

La seguridad física, operación del establecimiento, controles presenciales y actuación del personal de admisión son responsabilidad del Organizador y/o de los prestadores legalmente habilitados que éste contrate.

Los asistentes deberán respetar las instrucciones legítimas del personal de seguridad y las normas aplicables dentro del establecimiento.

## 24. Cancelación de Eventos

Cuando un Evento sea cancelado definitivamente, se aplicará la Política de Reembolsos de ENPASS.

Como política general, las compras afectadas serán elegibles para la devolución del total efectivamente abonado correspondiente a las entradas alcanzadas, incluidos los Cargos de Servicio asociados cuando así corresponda conforme a dicha política y a la legislación aplicable.

ENPASS podrá gestionar estos reembolsos frente al Comprador sin que ello altere la responsabilidad económica existente entre ENPASS y el Organizador.

## 25. Reprogramación

Cuando un Evento sea reprogramado, las entradas existentes continuarán siendo válidas para la nueva fecha salvo indicación expresa en contrario.

El Comprador podrá conservar su entrada.

Cuando corresponda una opción de devolución, ENPASS informará nueva fecha, condiciones, procedimiento y plazo aplicable.

Las devoluciones se regirán por la Política de Reembolsos.

## 26. Cambios en el Evento

Los Eventos pueden sufrir modificaciones.

Cambios operativos menores no generan automáticamente derecho a devolución.

Cuando exista una modificación sustancial de las condiciones bajo las cuales fue comercializado el Evento, se aplicará lo dispuesto en la Política de Reembolsos y la legislación correspondiente.

## 27. Derecho de arrepentimiento

Los compradores alcanzados por la normativa argentina aplicable podrán ejercer su derecho de arrepentimiento.

Para entradas correspondientes a espectáculos, eventos deportivos o artísticos, el plazo será de **diez (10) días corridos** contado conforme a la legislación aplicable y la solicitud deberá cursarse con una anticipación mínima de **veinticuatro (24) horas antes del Evento**.

ENPASS dispondrá de un **Botón de Arrepentimiento** visible y accesible.

No será necesario iniciar sesión para comenzar la gestión.

ENPASS podrá aplicar mecanismos razonables destinados exclusivamente a verificar la identidad y seguridad del usuario.

Las condiciones completas se encuentran establecidas en la Política de Reembolsos de ENPASS.

## 28. Política de Reembolsos

La **Política de Reembolsos de ENPASS** forma parte integrante de estos Términos y Condiciones.

Dicha política regula, entre otras cuestiones, arrepentimiento, cancelaciones, reprogramaciones, modificaciones sustanciales, compras duplicadas, entradas utilizadas, reembolsos parciales, entradas transferidas, contracargos y prevención de fraude.

Cuando exista una contradicción con un derecho irrenunciable reconocido legalmente, prevalecerá la normativa aplicable.

## 29. Contracargos y desconocimientos

El Comprador deberá utilizar de buena fe los mecanismos de reembolso y de disputa de pagos.

Un contracargo o desconocimiento presentado ante una entidad financiera es independiente de una solicitud de devolución ante ENPASS.

No corresponde obtener una doble devolución sobre una misma operación.

Cuando exista un procedimiento de contracargo activo, ENPASS podrá suspender temporalmente un reembolso paralelo hasta conocer el resultado de la disputa.

ENPASS podrá proporcionar al procesador de pagos la documentación necesaria para acreditar existencia de la operación, aceptación de la compra, emisión y entrega de entradas, transferencias, comunicaciones y utilización o intento de utilización.

## 30. Prevención de fraude

ENPASS podrá utilizar herramientas automatizadas y/o revisiones manuales para detectar operaciones fraudulentas, medios de pago comprometidos, apropiación de cuentas, duplicación de entradas, abuso de promociones, reventa no autorizada, intentos de acceso ilegítimos o abuso de mecanismos de reembolso.

Cuando existan indicios razonables de fraude, ENPASS podrá limitar temporalmente una operación, entrada o cuenta mientras se realiza una verificación.

Estas medidas deberán aplicarse de manera razonable y no podrán utilizarse para restringir derechos irrenunciables.

## 31. Cuenta y acceso mediante Magic Link

ENPASS podrá permitir el acceso a determinadas funcionalidades mediante enlaces temporales enviados por correo electrónico u otros mecanismos de autenticación sin contraseña.

Estos enlaces son personales y el usuario no deberá compartirlos con terceros.

ENPASS podrá limitar su duración, invalidarlos después de su uso, revocarlos por motivos de seguridad y solicitar una nueva autenticación para operaciones sensibles.

## 32. Responsabilidad de los datos ingresados

El usuario deberá proporcionar información verdadera, actual y suficiente para procesar correctamente sus operaciones.

ENPASS podrá solicitar correcciones o verificaciones cuando existan inconsistencias razonables.

La utilización deliberada de identidades falsas, datos de terceros sin autorización o medios de pago fraudulentos podrá ocasionar la suspensión de operaciones y las acciones legales que correspondan.

## 33. Comunicaciones electrónicas

El usuario acepta recibir las comunicaciones operativas necesarias para gestionar su relación con ENPASS, incluyendo confirmaciones de compra, entrega de entradas, avisos de seguridad, reprogramaciones, cancelaciones, cambios importantes, transferencias, reembolsos e información indispensable relativa al Evento.

Estas comunicaciones operativas son independientes de las comunicaciones publicitarias o promocionales.

## 34. Cortesías y entradas gratuitas

Las entradas gratuitas o cortesías podrán encontrarse sujetas a condiciones particulares.

Una entrada sin importe abonado no genera por sí misma derecho a un reembolso monetario.

La utilización de cortesías con fines de reventa podrá encontrarse prohibida.

## 35. Disponibilidad de la plataforma

ENPASS procura mantener sus sistemas disponibles y operativos de manera razonable.

Podrán existir interrupciones derivadas de mantenimiento, actualizaciones, fallas de terceros, problemas de telecomunicaciones, incidentes de infraestructura o circunstancias de fuerza mayor.

ENPASS adoptará medidas razonables para prevenir, mitigar y solucionar incidentes dentro del ámbito de sus responsabilidades.

Nada de lo establecido en esta cláusula limita los derechos que legalmente correspondan al usuario por incumplimientos imputables a ENPASS.

## 36. Dispositivos y conectividad del usuario

El usuario es responsable de contar con un dispositivo y conectividad adecuados para utilizar funcionalidades digitales cuando esto sea razonablemente necesario.

Cuando un Evento utilice entradas digitales, ENPASS y/o el Organizador podrán disponer mecanismos alternativos de validación o asistencia cuando resulte necesario.

## 37. Propiedad intelectual

El software, diseño, marca, interfaz, código, logotipos, bases de datos y demás elementos propios de ENPASS se encuentran protegidos por la legislación aplicable.

Los contenidos específicos de cada Evento -incluyendo nombres, imágenes, marcas, piezas promocionales y material audiovisual- podrán pertenecer al Organizador o a terceros.

La utilización de ENPASS no concede al usuario derechos de propiedad intelectual sobre estos elementos.

## 38. Uso indebido de la plataforma

Está prohibido vulnerar sistemas de seguridad, intentar acceder a información sin autorización, automatizar compras de forma abusiva, interferir con el funcionamiento de ENPASS, explotar vulnerabilidades, manipular entradas, falsificar QRs, hacerse pasar por otra persona, utilizar datos o medios de pago ajenos sin autorización, intentar obtener reembolsos duplicados o utilizar ENPASS para actividades ilícitas.

ENPASS podrá limitar el acceso ante incumplimientos graves, sin perjuicio de los derechos que correspondan a usuarios de buena fe.

## 39. Limitación y distribución de responsabilidades

ENPASS será responsable por las obligaciones que correspondan al servicio tecnológico y operativo que efectivamente presta.

El Organizador será responsable por la producción, realización y operación del Evento dentro del ámbito de sus obligaciones.

Ninguna disposición de estos términos deberá interpretarse como una renuncia a derechos del consumidor, una exención frente a responsabilidad que legalmente no pueda limitarse o una exclusión de responsabilidad por conducta propia cuando la ley establezca lo contrario.

## 40. Protección de datos personales

El tratamiento de datos personales realizado mediante ENPASS se regirá por la **Política de Privacidad** vigente y por la legislación aplicable.

Determinadas operaciones podrán requerir compartir información estrictamente necesaria con el Organizador, procesadores de pago, servicios tecnológicos, proveedores de comunicaciones y autoridades legalmente facultadas.

La finalidad, base, alcance y condiciones de dicho tratamiento serán desarrollados específicamente en la Política de Privacidad de ENPASS.

## 41. Modificaciones de estos Términos

ENPASS podrá actualizar estos Términos y Condiciones para reflejar modificaciones legislativas, nuevas funcionalidades, cambios operativos, mejoras de seguridad o cambios en los servicios.

La nueva versión se aplicará desde la fecha informada.

Las modificaciones no alterarán retroactivamente derechos adquiridos ni las condiciones aplicables a operaciones anteriores cuando ello resulte contrario a la legislación vigente.

ENPASS conservará un registro de las versiones relevantes.

## 42. Versión aplicable a una compra

A efectos de determinar las condiciones aplicables a una operación, ENPASS podrá conservar registro de la versión de estos Términos, la versión de la Política de Reembolsos, las condiciones particulares del Evento y la fecha y hora de aceptación.

De esta manera, las condiciones de una compra podrán ser reconstruidas posteriormente aun cuando ENPASS haya actualizado sus documentos.

## 43. Nulidad parcial

Si una disposición de estos Términos fuese declarada inválida, inaplicable o contraria a una norma obligatoria, ello no afectará necesariamente la validez de las demás disposiciones.

La cláusula afectada será interpretada o sustituida en la medida necesaria para adecuarla a la legislación aplicable.

## 44. Legislación aplicable y jurisdicción

Estos Términos se regirán por las leyes de la República Argentina.

En relaciones de consumo se respetarán las normas de competencia y jurisdicción legalmente aplicables al consumidor.

Ninguna disposición de estos Términos implica una renuncia del consumidor a la jurisdicción que le corresponda conforme a la legislación vigente.

## 45. Atención y contacto

Para consultas relacionadas con compras, entradas, accesos, reembolsos o funcionamiento de ENPASS, los usuarios podrán utilizar los canales de atención publicados en la plataforma.

**ENPASS**
Razón social: **[●]**
CUIT: **[●]**
Domicilio: **[●]**
Correo electrónico: **[●]**

Para ejercer específicamente el derecho de arrepentimiento, el usuario podrá utilizar el **Botón de Arrepentimiento** disponible en ENPASS.

---

**ENPASS - Entradas simples. Experiencias sin vueltas.**
$terms_v1$)) as doc(content);

insert into public.legal_documents (type, version, content_hash, status, content)
select 'privacy_policy', '1.0', encode(extensions.digest(doc.content, 'sha256'), 'hex'), 'active', doc.content
from (values ($privacy_v1$# Política de Privacidad y Protección de Datos Personales de ENPASS

**Versión 1.0 - Septiembre de 2026**

La presente Política de Privacidad describe cómo **[RAZÓN SOCIAL ENPASS]**, CUIT **[●]**, con domicilio en **[●]**, República Argentina, en adelante **"ENPASS"**, recopila, utiliza, almacena, comparte y protege datos personales relacionados con el uso de su plataforma.

ENPASS considera la privacidad y seguridad de la información como componentes esenciales de su servicio.

Esta Política deberá interpretarse conjuntamente con los Términos y Condiciones de ENPASS, la Política de Reembolsos y, cuando corresponda, las condiciones particulares de cada Evento.

## 1. Responsable del tratamiento

El responsable de las bases de datos administradas directamente por ENPASS es **[RAZÓN SOCIAL ENPASS]**, CUIT **[●]**, con domicilio en **[●]** y correo para cuestiones de privacidad **[●]**.

Los datos personales serán tratados conforme a la Ley N.º 25.326 de Protección de los Datos Personales, su Decreto Reglamentario N.º 1558/2001 y demás normativa aplicable.

## 2. Qué es un dato personal

Se considera dato personal toda información referida a una persona humana determinada o determinable. Esto puede incluir, entre otros, nombre, apellido, DNI, correo electrónico, teléfono, fecha de nacimiento, información relacionada con compras, identificadores técnicos, registros de acceso e información vinculada a Entradas.

## 3. Datos que podemos recopilar

### 3.1 Datos de identificación

Podrán incluir nombre, apellido, DNI cuando corresponda, fecha de nacimiento cuando sea necesaria e información necesaria para verificar identidad.

ENPASS aplicará un criterio de minimización y no solicitará identificación adicional cuando no resulte necesaria.

### 3.2 Datos de contacto

Podrán incluir correo electrónico, número telefónico e información de contacto utilizada durante la compra.

### 3.3 Información de cuenta

Cuando exista una cuenta ENPASS podrán tratarse identificador de usuario, correo, configuraciones, preferencias e historial asociado.

ENPASS podrá permitir autenticación mediante Magic Link, códigos de verificación u otros mecanismos sin contraseña.

### 3.4 Información de compras

Podrá incluir Evento, Orden, Entradas adquiridas, cantidades, precios, descuentos, Cargo de Servicio, fecha y hora de compra, estado de la operación, reembolsos, transferencias y promociones utilizadas.

### 3.5 Información de pagos

Los pagos podrán ser procesados mediante Mercado Pago u otros proveedores.

ENPASS podrá almacenar información necesaria para identificar y conciliar una operación, incluyendo `payment_id`, `preference_id`, estado, importe, moneda, medio general de pago, referencias del procesador e información necesaria para refunds y disputas.

**ENPASS no tiene como objetivo almacenar números completos de tarjetas ni códigos de seguridad CVV/CVC.** La información sensible necesaria para autorizar la tarjeta deberá ser procesada por el proveedor de pagos correspondiente.

### 3.6 Información de Entradas

Podrá incluir `ticket_id`, QR o identificador asociado, tipo de Entrada, sector, titular original, holder actual, historial de transferencia, estado y utilización.

### 3.7 Información de accesos

Cuando una Entrada sea validada podrán registrarse Evento, Ticket, fecha y hora, puerta o punto de acceso, dispositivo autorizado, resultado de validación, cantidad de accesos utilizados y usuario u operador que realizó la validación cuando corresponda.

Estos registros son necesarios para impedir el uso duplicado de Entradas, gestionar incidentes y responder a reclamos.

### 3.8 Información técnica

ENPASS podrá registrar datos técnicos razonablemente necesarios para seguridad, prevención de fraude, funcionamiento, diagnóstico y auditoría, incluyendo dirección IP, tipo de navegador, sistema operativo, user-agent, identificadores técnicos, fecha y hora y eventos de seguridad.

ENPASS no utilizará estos datos de manera incompatible con las finalidades informadas.

### 3.9 Comunicaciones

Cuando un usuario contacte a ENPASS, podremos conservar mensajes, correos, solicitudes, reclamos, información de soporte y documentación aportada voluntariamente.

### 3.10 Datos de Organizadores

Cuando una persona utilice ENPASS profesionalmente como Organizador o miembro de una organización, podrán tratarse además CUIT, razón social, condición fiscal, representación, cargo, datos de facturación, información vinculada con Mercado Pago, configuraciones comerciales y registros administrativos.

## 4. Datos sensibles

ENPASS no busca recopilar datos sensibles salvo que resulten estrictamente necesarios para una finalidad legítima y legalmente habilitada.

El Organizador no deberá utilizar campos personalizados de ENPASS para solicitar indiscriminadamente datos sensibles.

Cuando determinada información sensible resulte estrictamente necesaria, deberá utilizarse únicamente para la finalidad correspondiente y con las garantías legalmente aplicables.

## 5. Para qué utilizamos la información

ENPASS podrá tratar datos personales para crear y administrar cuentas, identificar Compradores, procesar operaciones, emitir Entradas, enviar confirmaciones, permitir acceso a "Mis entradas", gestionar Magic Links, transferir Entradas, validar accesos, impedir uso duplicado, procesar reembolsos, aplicar derecho de arrepentimiento, gestionar cancelaciones y reprogramaciones, gestionar reclamos, detectar fraude, prevenir contracargos, conciliar pagos, cumplir obligaciones fiscales y legales, brindar soporte, mejorar seguridad y estabilidad, generar estadísticas, gestionar Organizadores, enviar comunicaciones operativas y cumplir órdenes de autoridades competentes.

## 6. Necesidad contractual

Determinados datos resultan necesarios para gestionar una compra o utilizar funcionalidades solicitadas por el usuario.

Cuando un dato sea obligatorio, ENPASS deberá informar razonablemente dicha circunstancia.

## 7. Consentimiento

Cuando la normativa aplicable requiera consentimiento para un tratamiento específico, ENPASS deberá solicitarlo de manera libre, previa, expresa e informada, según corresponda.

La aceptación de comunicaciones de marketing deberá mantenerse separada de las comunicaciones operativas indispensables para gestionar una compra.

No deberá condicionarse una compra al consentimiento para recibir publicidad cuando dicho consentimiento no resulte necesario para realizar la operación.

## 8. Comunicaciones operativas

ENPASS podrá enviar comunicaciones necesarias para gestionar el servicio, incluyendo confirmación de compra, entrega de Entradas, Magic Links, códigos de autenticación, cambios del Evento, cancelaciones, reprogramaciones, cambios de acceso, reembolsos, transferencias, alertas de seguridad e información relevante para asistir.

Estas comunicaciones no constituyen necesariamente publicidad.

## 9. Marketing

ENPASS podrá enviar comunicaciones comerciales cuando exista una habilitación legal válida para ello.

El usuario podrá solicitar en cualquier momento dejar de recibir estas comunicaciones.

Cada comunicación promocional deberá incluir un mecanismo razonablemente accesible para gestionar la baja.

La baja de marketing no impedirá recibir comunicaciones operativas relacionadas con Entradas, compras o seguridad.

## 10. Organizadores y marketing

Comprar una Entrada para un Evento **no implica automáticamente aceptar comunicaciones promocionales futuras del Organizador**.

El Organizador solamente podrá utilizar información recibida mediante ENPASS para gestionar el Evento, facilitar el acceso, brindar información necesaria, prestar soporte y cumplir obligaciones legales, salvo que exista consentimiento u otra habilitación legal suficiente para un uso diferente.

ENPASS podrá implementar mecanismos independientes para que un usuario acepte voluntariamente recibir comunicaciones comerciales de un Organizador.

## 11. Datos compartidos con el Organizador

Para realizar correctamente el Evento, ENPASS podrá proporcionar al Organizador determinados datos necesarios, como nombre, identificación de Entrada, sector, estado, información necesaria para acreditación e información de contacto cuando resulte operativamente necesaria.

El Organizador deberá limitar el tratamiento a las finalidades legalmente permitidas y contractualmente autorizadas.

Una vez que el Organizador utilice los datos para finalidades propias independientes, será responsable por dicho tratamiento dentro del ámbito que legalmente le corresponda.

## 12. Procesadores de pago

ENPASS podrá compartir información necesaria con Mercado Pago u otros proveedores encargados de procesar pagos, prevención de fraude, devoluciones, contracargos y conciliación.

El tratamiento realizado directamente por estos proveedores podrá encontrarse además sujeto a sus propias políticas de privacidad y obligaciones regulatorias.

## 13. Proveedores tecnológicos

ENPASS podrá contratar proveedores para infraestructura cloud, bases de datos, hosting, almacenamiento, comunicaciones, email, observabilidad, soporte, prevención de fraude, analítica y seguridad.

Los proveedores deberán recibir únicamente la información necesaria para prestar sus servicios y encontrarse sujetos a obligaciones adecuadas de confidencialidad y protección.

## 14. Infraestructura actual

ENPASS utiliza o puede utilizar infraestructura y servicios tecnológicos de terceros, incluyendo componentes provistos por Supabase, Vercel, Mercado Pago, servicios de correo electrónico y proveedores de observabilidad, seguridad o comunicaciones.

La lista efectiva de proveedores deberá mantenerse actualizada internamente y reflejarse públicamente cuando resulte necesario.

## 15. Transferencias internacionales

La utilización de infraestructura tecnológica internacional puede implicar transferencias o accesos a datos desde otros países.

ENPASS procurará realizar dichas transferencias únicamente cuando el destino cuente con nivel adecuado de protección reconocido por la normativa argentina, exista un mecanismo contractual apropiado, exista consentimiento cuando corresponda o exista otra excepción legalmente permitida.

## 16. Venta de datos

ENPASS **no vende datos personales de compradores a terceros**.

La existencia de relaciones comerciales con Organizadores, proveedores tecnológicos o procesadores de pagos no implica la venta de información personal.

## 17. Cookies y tecnologías similares

ENPASS podrá utilizar cookies o tecnologías equivalentes para mantener sesiones, seguridad, recordar configuraciones, medir funcionamiento, comprender uso de la plataforma y prevenir fraude.

Cuando ENPASS incorpore tecnologías de analítica, publicidad u otras funcionalidades que requieran una gestión específica de consentimiento, deberá implementar los controles correspondientes.

## 18. Analítica

ENPASS podrá analizar información de uso para comprender rendimiento, errores, conversión, navegación, utilización de funcionalidades y demanda de Eventos.

Siempre que sea posible, se utilizarán datos agregados o minimizados.

## 19. Decisiones automatizadas y fraude

ENPASS podrá utilizar reglas automatizadas para identificar operaciones potencialmente fraudulentas.

Una señal automatizada podrá solicitar verificación adicional, limitar temporalmente una operación o enviarla a revisión manual.

ENPASS procurará no adoptar decisiones perjudiciales injustificadas basadas exclusivamente en mecanismos opacos cuando resulte necesaria una intervención adicional.

## 20. Seguridad

ENPASS aplicará medidas técnicas y organizativas razonables destinadas a proteger la información frente a acceso no autorizado, pérdida, alteración, divulgación indebida, abuso, destrucción y fraude.

Las medidas podrán comprender autenticación, permisos, Row Level Security, cifrado, control de secretos, registros de auditoría, monitoreo, backups, rate limiting, tokens temporales y segregación de roles.

Ningún sistema es absolutamente inmune a incidentes.

## 21. Magic Links y autenticación

Los Magic Links o códigos de autenticación son personales y temporales.

ENPASS podrá limitar su duración, invalidarlos después del uso, impedir reutilización, registrar eventos de seguridad y solicitar autenticación nuevamente para operaciones sensibles.

## 22. Personal de Organizadores

El Organizador será responsable por los usuarios a quienes otorgue acceso a información mediante su panel.

ENPASS podrá implementar diferentes permisos para propietario, administrador, finanzas, operador de Evento, accesos y soporte.

No todos los roles deberán poder consultar la misma información.

## 23. RRPP y vendedores

Los usuarios de RRPP o vendedores solamente deberán acceder a los datos necesarios para desempeñar sus funciones.

El hecho de atribuir una venta a un RRPP no implica que éste deba recibir acceso irrestricto a la información personal del comprador.

## 24. Retención de información

ENPASS conservará información mientras resulte razonablemente necesaria para prestar el servicio, mantener Entradas, gestionar Eventos, atender reclamos, procesar reembolsos, responder contracargos, conciliar operaciones, cumplir obligaciones fiscales, contractuales y legales, prevenir fraude y ejercer o defender derechos.

Una vez que la información deje de resultar necesaria, deberá ser eliminada, anonimizada o archivada conforme a la normativa aplicable.

No deberán conservarse datos indefinidamente sin una finalidad válida.

## 25. Eliminación y obligaciones legales

Una solicitud de supresión no implica necesariamente la eliminación inmediata de toda referencia existente.

Determinada información podrá necesitar conservarse por obligaciones legales, facturación, prevención de fraude, reclamos, ejercicio o defensa de derechos, seguridad u operaciones todavía vigentes.

## 26. Derechos de los titulares

Las personas podrán ejercer, conforme a la legislación aplicable, derechos relacionados con sus datos personales, incluyendo información, acceso, rectificación, actualización y supresión.

Las solicitudes deberán realizarse mediante los mecanismos de privacidad habilitados por ENPASS.

## 27. Derecho de acceso

El titular podrá solicitar información acerca de los datos personales que ENPASS mantenga sobre él.

ENPASS deberá responder dentro de los plazos previstos por la legislación vigente y podrá solicitar información necesaria para verificar la identidad de quien presenta la solicitud.

## 28. Rectificación, actualización y supresión

Cuando existan datos incorrectos, desactualizados o cuyo tratamiento deba cesar, el titular podrá solicitar su rectificación, actualización o supresión según corresponda.

ENPASS gestionará estas solicitudes dentro de los plazos legalmente aplicables.

## 29. Verificación de identidad

Para proteger la información, ENPASS podrá verificar razonablemente la identidad antes de responder una solicitud de privacidad.

La verificación deberá ser proporcional al riesgo y no deberá utilizarse para obstaculizar el ejercicio de derechos.

## 30. Autoridad de control

La **Agencia de Acceso a la Información Pública (AAIP)** es la autoridad de aplicación competente en materia de protección de datos personales en Argentina.

## 31. Registro de bases de datos

ENPASS realizará las inscripciones de bases o bancos de datos que legalmente correspondan ante el Registro Nacional de Bases de Datos Personales.

Los datos de inscripción y responsable deberán mantenerse actualizados conforme a la normativa vigente.

## 32. Incidentes de seguridad

Ante un incidente relevante que afecte datos personales, ENPASS deberá identificar el incidente, contenerlo, preservar evidencias, evaluar alcance y riesgo, corregir la vulnerabilidad, documentar la respuesta y adoptar las comunicaciones o medidas que legalmente correspondan.

Los Organizadores deberán informar inmediatamente a ENPASS cualquier incidente relacionado con información obtenida mediante la plataforma.

## 33. Información de menores

ENPASS no está diseñado específicamente como un servicio dirigido a menores de edad.

Cuando resulte necesario tratar información relativa a menores, ENPASS y el Organizador deberán aplicar medidas adecuadas y limitar los datos a aquellos estrictamente necesarios para la finalidad correspondiente.

## 34. Datos anonimizados

ENPASS podrá utilizar información agregada o anonimizada para estadísticas, planificación, mejora del producto, seguridad y análisis comercial.

## 35. Cambios en esta Política

ENPASS podrá modificar esta Política cuando existan cambios normativos, nuevos proveedores, nuevas funcionalidades, cambios de infraestructura o nuevas formas de tratamiento.

Las modificaciones sustanciales serán comunicadas cuando corresponda y ENPASS conservará versiones anteriores cuando resulte necesario para auditoría.

## 36. Versión aplicable

La versión vigente estará disponible en **/privacidad**.

ENPASS podrá registrar la versión informada o aceptada en aquellas operaciones para las cuales resulte necesario preservar evidencia.

## 37. Contacto

**ENPASS**
Responsable: **[RAZÓN SOCIAL]**
CUIT: **[●]**
Domicilio: **[●]**
Correo de privacidad: **[●]**

---

**ENPASS - Tus entradas son tuyas. Tus datos también.**
$privacy_v1$)) as doc(content);

insert into public.legal_documents (type, version, content_hash, status, content)
select 'organizer_agreement', '1.0', encode(extensions.digest(doc.content, 'sha256'), 'hex'), 'active', doc.content
from (values ($organizer_v1$# Acuerdo y Términos para Organizadores de ENPASS

**Versión 1.0 - Septiembre de 2026**

Los presentes Términos regulan la relación comercial entre **[RAZÓN SOCIAL ENPASS]**, CUIT **[●]**, con domicilio en **[●]**, República Argentina, en adelante **"ENPASS"**, y la persona humana o jurídica que publique, organice, produzca y/o comercialice eventos mediante ENPASS, en adelante el **"Organizador"**.

La aceptación de estos Términos, conjuntamente con las Condiciones Comerciales particulares acordadas entre las partes, constituye el acuerdo aplicable al uso profesional de ENPASS.

## 1. Definiciones

**ENPASS:** plataforma tecnológica de ticketing, pagos, gestión y control de accesos para eventos.

**Organizador:** persona humana o jurídica responsable de organizar, producir, explotar o comercializar el Evento.

**Evento:** espectáculo, fiesta, recital, actividad deportiva, cultural, empresarial, gastronómica, recreativa o cualquier otra experiencia publicada mediante ENPASS.

**Comprador:** persona que adquiere una o más entradas.

**Entrada o Ticket:** credencial digital emitida mediante ENPASS que habilita el acceso al Evento en las condiciones correspondientes.

**Orden:** operación mediante la cual un Comprador adquiere una o más Entradas.

**Precio Base:** importe correspondiente a la Entrada antes de los cargos adicionales aplicables.

**Cargo de Servicio ENPASS:** importe o comisión correspondiente a los servicios tecnológicos y operativos prestados por ENPASS.

**Procesador de Pago:** Mercado Pago u otro proveedor habilitado utilizado para procesar las operaciones.

**Reembolso:** devolución total o parcial de fondos correspondientes a una operación aprobada.

**Contracargo o Disputa:** procedimiento iniciado ante el procesador, banco, tarjeta u otra entidad mediante el cual se cuestiona una operación.

**Condiciones Comerciales:** documento, configuración o acuerdo particular que determina para cada Organizador aspectos como comisión, servicios adicionales, condiciones económicas y modalidad operativa.

## 2. Objeto

ENPASS proporciona al Organizador infraestructura tecnológica para la comercialización y gestión de Entradas, incluyendo, según las funcionalidades contratadas, publicación de Eventos, tipos y etapas de Entradas, procesamiento de compras, integración con medios de pago, emisión de Entradas digitales, códigos QR, holders, transferencias, control de accesos, operación multi-puerta, reportes, promociones, cortesías, vendedores y RRPP, mesas y sectores, asientos numerados, comunicaciones, reembolsos, métricas y otras funcionalidades habilitadas por ENPASS.

Las funcionalidades disponibles podrán variar según el plan, configuración o acuerdo comercial aplicable.

## 3. Independencia de las partes

ENPASS y el Organizador son partes jurídicamente independientes.

La relación no constituye sociedad, relación laboral, franquicia, representación exclusiva, joint venture, asociación ni mandato general.

ENPASS podrá actuar tecnológicamente en la comercialización, procesamiento de pagos, gestión de Entradas y reembolsos conforme a las facultades necesarias para prestar el servicio.

El Organizador conserva la responsabilidad por la producción y realización del Evento.

## 4. Responsabilidad del Organizador sobre el Evento

El Organizador declara y garantiza que cuenta con capacidad suficiente para realizar y comercializar el Evento.

Es responsable, entre otras cuestiones, de la realización efectiva del Evento, contratación y disponibilidad legal del establecimiento, habilitaciones, permisos, autorizaciones, seguros obligatorios, seguridad, personal, capacidad y aforo, contratación de artistas, derechos musicales o intelectuales, condiciones de admisión, restricciones de edad, horarios, programación, servicios ofrecidos, información publicada, obligaciones impositivas y cumplimiento de las normas aplicables.

La utilización de ENPASS no implica que ENPASS certifique o garantice que el Organizador haya cumplido estas obligaciones.

ENPASS podrá solicitar documentación cuando resulte razonablemente necesaria.

## 5. Información del Organizador

El Organizador deberá proporcionar información verdadera y actualizada, incluyendo cuando corresponda razón social o nombre, CUIT, domicilio, condición fiscal, representantes autorizados, datos de contacto, información bancaria o financiera, información requerida por el procesador de pagos, documentación societaria y datos necesarios para facturación.

El Organizador deberá informar cualquier modificación relevante.

ENPASS podrá suspender nuevas operaciones cuando no pueda verificar razonablemente la identidad o capacidad del Organizador.

## 6. Cuenta de Mercado Pago y OAuth

Cuando la operación utilice Mercado Pago Marketplace / Split Payments, el Organizador deberá vincular una cuenta válida mediante el flujo oficial de OAuth.

El Organizador deberá ser titular legítimo de la cuenta vinculada, mantenerla operativa, completar las validaciones de identidad requeridas por Mercado Pago, no revocar permisos mientras existan Eventos activos, operaciones, reembolsos o disputas pendientes y mantener actualizada la información solicitada por el procesador.

ENPASS nunca solicitará al Organizador que entregue sus credenciales personales de Mercado Pago.

La autorización deberá realizarse mediante los mecanismos oficiales del procesador.

## 7. Procesamiento mediante Marketplace / Split

Cuando se utilice la modalidad Split Payments 1:1, el pago podrá dividirse automáticamente entre el Organizador y ENPASS conforme a la configuración vigente para la operación.

La participación correspondiente a ENPASS podrá instrumentarse técnicamente mediante `marketplace_fee`, `application_fee` o el mecanismo equivalente soportado por el procesador.

La utilización del procesador se encontrará adicionalmente sujeta a sus propias condiciones.

## 8. Precio de las Entradas

El Organizador determinará el Precio Base de las Entradas, salvo que exista un acuerdo comercial diferente.

Será responsable por la exactitud de precios, categorías, sectores, etapas, promociones, cupos y capacidad disponible.

ENPASS podrá impedir configuraciones manifiestamente inconsistentes o técnicamente inválidas.

Una modificación de precios no deberá alterar retroactivamente las operaciones ya confirmadas.

## 9. Comisión y Cargo de Servicio de ENPASS

ENPASS cobrará la comisión o Cargo de Servicio establecido en las Condiciones Comerciales correspondientes.

La comisión podrá definirse como porcentaje, importe fijo, combinación de ambos o modalidad especial acordada.

Podrán existir diferentes configuraciones según Organizador, Evento, tipo de Entrada, canal, método de pago o servicio adicional.

La configuración comercial aplicable deberá quedar registrada y una modificación futura no alterará retroactivamente operaciones ya confirmadas.

## 10. Facturación de la comisión

ENPASS emitirá la documentación fiscal correspondiente a sus servicios conforme a la normativa aplicable.

Cuando la comisión sea cobrada automáticamente mediante Split Payments, la retención económica de dicha comisión y su facturación constituyen operaciones relacionadas pero distintas.

Salvo acuerdo particular diferente, ENPASS podrá realizar la facturación al cierre del Evento, mediante períodos de liquidación o conforme a la modalidad comercial acordada con el Organizador.

## 11. Comisiones del Procesador de Pago

Los costos, tasas, comisiones, retenciones e impuestos aplicados por Mercado Pago u otros procesadores podrán ser descontados de acuerdo con las reglas de dichos servicios.

La comisión de ENPASS es independiente de las comisiones que pudiera aplicar el Procesador de Pago.

Antes de comenzar a comercializar un Evento, el Organizador deberá poder conocer la estructura económica aplicable.

## 12. Impuestos

Cada parte será responsable por sus propias obligaciones fiscales.

El Organizador será responsable por los impuestos derivados de la venta de Entradas, realización del Evento, explotación comercial, ingresos propios y actividades bajo su responsabilidad.

ENPASS será responsable por las obligaciones fiscales correspondientes a los servicios que facture.

ENPASS podrá aplicar retenciones o percepciones cuando una norma obligatoria lo requiera.

## 13. Disponibilidad de fondos

El Organizador reconoce que una venta de Entradas puede generar obligaciones posteriores, incluyendo reembolsos, arrepentimientos, contracargos, operaciones fraudulentas, cancelaciones, reprogramaciones, errores de cobro y ajustes del procesador.

En consecuencia, los fondos recibidos por una venta no deberán considerarse económicamente definitivos mientras puedan existir obligaciones pendientes derivadas de la operación.

## 14. Obligación de mantener fondos suficientes

El Organizador deberá mantener fondos suficientes en los medios de cobro utilizados para afrontar obligaciones razonablemente previsibles derivadas de reembolsos, cancelaciones, reprogramaciones, contracargos, disputas y ajustes.

Esta obligación será especialmente relevante mientras existan Eventos pendientes de realización.

La extracción o utilización de fondos por parte del Organizador no extingue sus obligaciones económicas frente a Compradores, procesadores o ENPASS.

## 15. Reserva o garantía para Eventos

ENPASS podrá requerir una reserva, garantía o mecanismo adicional de cobertura cuando existan razones comerciales objetivas que indiquen un riesgo superior al habitual.

Podrán considerarse, entre otros factores, Organizador nuevo, volumen elevado de recaudación, Evento de gran capacidad, elevado tiempo entre venta y realización, historial de cancelaciones, nivel significativo de reembolsos, contracargos elevados, cambios reiterados del Evento, antecedentes de incumplimiento o riesgo financiero razonablemente verificable.

La reserva podrá consistir, según lo acordado, en depósito, garantía, saldo mínimo, retención habilitada por la infraestructura financiera u otro mecanismo razonable.

Las condiciones deberán ser informadas al Organizador.

ENPASS no dispondrá arbitrariamente de estos fondos para fines ajenos a las obligaciones cubiertas.

## 16. Derecho de arrepentimiento de compradores

El Organizador reconoce que determinadas operaciones realizadas a distancia se encuentran sujetas al derecho de arrepentimiento previsto por la normativa vigente.

Cuando corresponda legalmente un arrepentimiento, ENPASS podrá procesarlo sin requerir autorización individual del Organizador, las Entradas involucradas serán invalidadas, el importe correspondiente deberá ser reintegrado al Comprador y el Organizador deberá colaborar económicamente con la devolución en la proporción que corresponda.

La elegibilidad legal del Comprador no dependerá de que el Organizador desee autorizar la devolución.

## 17. Distribución económica del arrepentimiento

Salvo que las Condiciones Comerciales establezcan una distribución diferente y siempre respetando los derechos del Comprador, el Organizador soportará la devolución de los importes correspondientes a su participación económica en la venta, ENPASS soportará la reversión del Cargo de Servicio que legalmente corresponda devolver y los costos no reversados por el procesador se distribuirán conforme a las Condiciones Comerciales o a la causa de la devolución.

El Comprador no deberá intervenir en esta distribución interna.

## 18. Cancelación definitiva de un Evento

Si un Evento es cancelado definitivamente, el Organizador deberá informar a ENPASS inmediatamente y por los canales habilitados.

Publicaciones en redes, comunicaciones informales o avisos exclusivamente al establecimiento no sustituyen esa notificación.

Una cancelación podrá generar suspensión de nuevas ventas, bloqueo de Entradas, notificación a compradores, proceso masivo de reembolsos, conciliación financiera y obligaciones económicas a cargo del Organizador.

## 19. Reembolso ante cancelación

Como política general de ENPASS, cuando un Evento sea cancelado definitivamente y corresponda devolución, el Comprador recibirá el **total efectivamente abonado correspondiente a la operación alcanzada**, incluido el Cargo de Servicio asociado.

Cuando la cancelación resulte atribuible al Organizador, éste deberá asumir frente a ENPASS:

1. la devolución de los importes que hubiera recibido por las Entradas;
2. los Cargos de Servicio que ENPASS hubiera debido devolver a los compradores como consecuencia de la cancelación;
3. los costos del procesador que no hubieran sido restituidos, cuando resulten atribuibles a la cancelación;
4. otros costos extraordinarios de gestión exclusivamente cuando hayan sido previstos en las Condiciones Comerciales o resulten razonablemente acreditables.

Esta distribución económica no afectará el derecho del Comprador a recibir la devolución que corresponda.

## 20. Reprogramación

El Organizador deberá informar inmediatamente cualquier modificación de fecha.

Como regla técnica, las Entradas existentes continuarán válidas para la fecha reprogramada y no deberá exigirse innecesariamente la emisión de nuevas Entradas.

Cuando los Compradores tengan derecho a solicitar devolución, ENPASS podrá habilitar el mecanismo correspondiente.

El Organizador deberá asumir las obligaciones económicas derivadas de las devoluciones que le sean imputables en los términos de este Acuerdo.

## 21. Modificaciones sustanciales

El Organizador deberá comunicar previamente a ENPASS cualquier modificación relevante del Evento, incluyendo ciudad, establecimiento, fecha, horario sustancial, contenido principal, artista o prestación esencial cuando resulte determinante, capacidad, sectorización y condiciones fundamentales de acceso.

ENPASS podrá determinar que una modificación requiere comunicación adicional a los compradores o habilitación de devoluciones cuando corresponda conforme a la normativa y a la Política de Reembolsos.

## 22. Cambios sin autorización

El Organizador no deberá utilizar ENPASS para modificar silenciosamente información esencial después de haber comercializado Entradas.

ENPASS deberá conservar historial o snapshots suficientes para determinar qué condiciones fueron ofrecidas al momento de cada compra.

La modificación del Evento no alterará retroactivamente las condiciones aceptadas en operaciones anteriores.

## 23. Deuda del Organizador por reembolsos

Cuando ENPASS deba aportar fondos propios para cumplir una devolución cuya responsabilidad económica corresponda total o parcialmente al Organizador, el importe desembolsado por ENPASS constituirá una **deuda líquida o determinable a cargo del Organizador** una vez documentada y comunicada.

Esto podrá incluir capital adelantado, Cargo de Servicio devuelto, costos no recuperados del procesador, impuestos o cargos directamente relacionados y gastos extraordinarios razonablemente necesarios y documentados.

ENPASS entregará al Organizador la información necesaria para identificar las operaciones involucradas.

## 24. Pago de deuda con ENPASS

El Organizador deberá cancelar las sumas exigibles informadas por ENPASS dentro del plazo establecido en la liquidación o Condiciones Comerciales.

Ante mora podrán aplicarse los intereses expresamente acordados, dentro de los límites legales correspondientes.

ENPASS no aplicará penalidades ocultas o no pactadas.

## 25. Compensación

En la medida permitida por la legislación aplicable, el Organizador autoriza a ENPASS a compensar créditos líquidos y exigibles derivados de esta relación con importes que ENPASS adeude al Organizador.

La compensación podrá comprender comisiones futuras, liquidaciones administradas por ENPASS, créditos comerciales, servicios pendientes de pago u otras obligaciones recíprocas compensables.

Cuando la arquitectura de pagos no permita técnicamente retener fondos pertenecientes al Organizador, esta cláusula no autoriza a ENPASS a disponer unilateralmente de cuentas bancarias o de Mercado Pago ajenas.

En dichos casos, la recuperación deberá efectuarse mediante los mecanismos contractuales, financieros o judiciales correspondientes.

## 26. Recuperación mediante operaciones futuras

Cuando exista una deuda documentada y exigible, las partes podrán acordar que ENPASS recupere gradualmente el importe mediante operaciones futuras.

Cualquier modificación temporal de comisión o mecanismo de recuperación deberá estar contractualmente habilitada, ser técnicamente compatible con el procesador, quedar registrada y no afectar los derechos del Comprador.

ENPASS no modificará silenciosamente precios o comisiones para recuperar deudas.

## 27. Suspensión por deuda o falta de fondos

ENPASS podrá suspender nuevas ventas de un Organizador cuando existan deudas vencidas relevantes, insuficiencia persistente de fondos para reembolsos, incumplimiento de reservas acordadas, contracargos excepcionalmente elevados, falta de colaboración ante cancelaciones o riesgo razonable para compradores o ENPASS.

Cuando la urgencia lo permita, ENPASS notificará previamente al Organizador.

La suspensión de nuevas ventas no elimina las obligaciones correspondientes a Entradas previamente comercializadas.

## 28. Contracargos y disputas

El Organizador deberá colaborar con ENPASS y con el Procesador de Pago ante contracargos.

Podrá requerirse información sobre características del Evento, comprobantes, registros de compra, comunicaciones, acceso, validación del QR, utilización de la Entrada y condiciones aceptadas.

ENPASS podrá responder técnicamente una disputa cuando disponga de la información necesaria.

## 29. Distribución económica de contracargos

La responsabilidad económica interna por un contracargo deberá determinarse según su causa.

Cuando derive principalmente de cancelación, no realización del Evento, información falsa o sustancialmente incorrecta, incumplimiento del Organizador, negativa de acceso imputable al Organizador o prestación defectuosa atribuible al Organizador, el costo corresponderá al Organizador.

Cuando derive de una falla directamente atribuible a ENPASS, ENPASS responderá dentro del ámbito de su responsabilidad.

Cuando derive de fraude de pago u otros factores externos, se aplicarán las reglas del Procesador de Pago y las Condiciones Comerciales correspondientes.

## 30. Prohibición de doble devolución

ENPASS y el Organizador deberán evitar que una misma operación genere simultáneamente reembolso y contracargo cobrado favorablemente por el mismo Comprador.

Los sistemas deberán preservar trazabilidad suficiente para detectar estas situaciones.

## 31. Fraude

ENPASS podrá aplicar controles razonables para detectar medios de pago comprometidos, ventas artificiales, operaciones simuladas, reventa no autorizada, uso abusivo de promociones, compradores automatizados, manipulación de QRs, contracargos coordinados y otras conductas fraudulentas.

El Organizador no podrá solicitar a ENPASS que desactive controles críticos de seguridad para incrementar ventas.

## 32. Entradas y acceso

El estado central del Ticket registrado por ENPASS será la referencia tecnológica utilizada para determinar la validez de una Entrada.

Una captura de pantalla o reproducción de un QR no constituye una nueva Entrada.

La utilización válida de un Ticket podrá impedir automáticamente nuevos accesos desde otras puertas o dispositivos.

El Organizador deberá utilizar los sistemas de validación conforme a las instrucciones de ENPASS.

## 33. Personal de acceso

Cuando el Organizador utilice personal propio para los controles de acceso, será responsable de su capacitación, actuación, trato con asistentes, cumplimiento de las condiciones de admisión y utilización correcta del sistema.

Cuando ENPASS preste adicionalmente servicios de personal, scanners, taquilla, cajas o soporte presencial, dichos servicios podrán encontrarse sujetos a una cotización o Condición Comercial independiente.

## 34. Derecho de admisión

El Organizador es responsable de ejercer el derecho de admisión y permanencia conforme a la legislación vigente.

No podrá solicitar a ENPASS que implemente reglas arbitrarias o discriminatorias.

Las restricciones relevantes deberán ser objetivas y comunicadas previamente cuando corresponda.

La utilización de ENPASS no valida condiciones de admisión contrarias a la normativa.

## 35. Aforo

El Organizador será responsable de informar la capacidad habilitada del Evento y no podrá comercializar mediante ENPASS una cantidad de accesos superior a la permitida legalmente.

Cuando existan sectores, mesas, palcos, asientos o accesos diferenciados, deberá proporcionar información suficiente para configurar correctamente la disponibilidad.

ENPASS podrá bloquear nuevas ventas cuando se alcance el cupo configurado.

## 36. Cortesías

El Organizador podrá emitir cortesías cuando su plan o configuración lo permita.

Las cortesías podrán generar costos operativos definidos comercialmente, incluyendo cargos por emisión, procesamiento, utilización, escaneo o servicios asociados.

Estos costos deberán encontrarse previamente establecidos en las Condiciones Comerciales.

Una cortesía no deberá utilizarse para ocultar ventas pagadas por fuera de ENPASS cuando exista una obligación comercial de procesarlas a través de la plataforma.

## 37. Vendedores, RRPP y comisiones

Cuando el Organizador utilice módulos de RRPP, vendedores o promotores, será responsable de asignarlos, definir sus permisos, determinar comisiones y controlar sus actuaciones.

ENPASS podrá registrar ventas atribuibles a cada vendedor y calcular comisiones conforme a la configuración.

La relación entre el Organizador y sus RRPP o vendedores será responsabilidad del Organizador, salvo acuerdo expreso diferente.

## 38. Servicios adicionales

Podrán contratarse separadamente personal de acceso, scanners, taquilla, cajas, POS, conectividad, soporte presencial, acreditaciones, hardware, diseño de sectores, asistencia operativa u otros servicios.

Su precio, alcance y responsabilidad deberán constar en las Condiciones Comerciales o presupuesto correspondiente.

## 39. Comunicaciones a compradores

Cuando ocurra una cancelación, reprogramación, cambio sustancial, modificación de acceso o situación de seguridad relevante, el Organizador deberá comunicar la información a ENPASS con la anticipación razonablemente posible.

ENPASS podrá enviar comunicaciones operativas directamente a los compradores.

El Organizador autoriza dichas comunicaciones cuando sean necesarias para gestionar el Evento o proteger los derechos de los usuarios.

## 40. Uso de datos personales

Las partes deberán tratar los datos personales conforme a la normativa vigente y a la Política de Privacidad de ENPASS.

El Organizador solamente podrá utilizar la información obtenida mediante ENPASS para fines compatibles con administración del Evento, acceso, atención, obligaciones legales y finalidades autorizadas por los titulares.

El acceso técnico a información de compradores no implica autorización para incorporarlos indiscriminadamente a bases publicitarias propias.

Cuando se requiera consentimiento para marketing, deberá obtenerse de forma válida.

## 41. Seguridad de la información

El Organizador deberá proteger credenciales, accesos al panel, exportaciones, bases de asistentes e información comercial.

No deberá compartir usuarios administrativos entre personas de manera que impida determinar quién realizó una acción.

ENPASS podrá incorporar permisos, roles, autenticación adicional y registros de auditoría.

## 42. Propiedad intelectual del Organizador

El Organizador declara contar con derechos suficientes para utilizar el contenido que entregue a ENPASS, incluyendo logos, fotografías, videos, marcas, nombres, obras gráficas y descripciones.

Otorga a ENPASS una licencia no exclusiva y limitada para utilizarlos en la medida necesaria para comercializar y administrar el Evento.

## 43. Propiedad intelectual de ENPASS

La plataforma, código, diseño, marca, interfaces, modelos, infraestructura y tecnología propia de ENPASS continúan siendo propiedad de ENPASS o de sus licenciantes.

El Organizador no adquiere derechos de propiedad sobre ellos por utilizar el servicio.

## 44. Prohibiciones

El Organizador no podrá utilizar ENPASS para eventos ilegales, fraude, lavado de activos, venta de Entradas inexistentes, falsificación de información, evasión de controles, apropiación de datos, manipulación de pagos, actividades que infrinjan derechos de terceros o elusión deliberada de obligaciones económicas frente a ENPASS.

## 45. Suspensión inmediata

ENPASS podrá suspender preventivamente un Evento cuando exista evidencia razonable de fraude, Evento ficticio, riesgo grave para compradores, orden de autoridad competente, falta de habilitación esencial, incumplimiento grave, vulneración de seguridad o riesgo financiero extraordinario.

La suspensión preventiva no implica necesariamente terminación del contrato.

ENPASS deberá revisar razonablemente la situación y comunicar al Organizador los motivos cuando legalmente sea posible.

## 46. Indemnidad y derecho de repetición

El Organizador deberá mantener indemne y, cuando corresponda, reembolsar a ENPASS por los daños, pagos, gastos, condenas, sanciones o costos razonables que ENPASS deba afrontar como consecuencia directa de incumplimientos imputables al Organizador.

Esto comprende particularmente reclamos derivados de cancelación, incumplimiento del Evento, falta de habilitaciones, lesiones o incidentes bajo responsabilidad del Organizador, publicidad proporcionada por el Organizador, infracciones de propiedad intelectual, condiciones ilegales de admisión, incumplimientos fiscales propios, información falsa o violaciones de datos causadas por sistemas o personal del Organizador.

Esta cláusula no limita ni afecta los derechos que un consumidor pueda ejercer directamente frente a cualquiera de las partes conforme a la legislación vigente.

Si ENPASS fuera obligado a pagar frente a un tercero por un hecho cuya responsabilidad interna corresponda al Organizador, ENPASS conservará el derecho de repetición correspondiente.

## 47. Responsabilidad de ENPASS

ENPASS responderá por incumplimientos atribuibles a los servicios que efectivamente presta.

Nada de lo establecido en este Acuerdo podrá interpretarse como una exoneración de responsabilidad propia cuando una norma obligatoria determine lo contrario.

ENPASS no responderá internamente frente al Organizador por incumplimientos exclusivamente imputables a producción del Evento, artistas, establecimiento, seguridad física, permisos, operación presencial del Organizador o información incorrecta entregada por éste.

## 48. Fuerza mayor

Cuando un Evento no pueda realizarse por circunstancias de fuerza mayor, las partes coordinarán las medidas operativas necesarias.

La existencia de fuerza mayor no elimina automáticamente los derechos que pudieran corresponder a los Compradores.

La distribución interna de costos se analizará conforme a legislación aplicable, causa, seguros existentes, costos reversables y Condiciones Comerciales.

## 49. Seguros

ENPASS podrá requerir al Organizador comprobantes de seguros legalmente exigibles o comercialmente razonables en función del Evento.

La existencia de un seguro no libera al Organizador de sus obligaciones.

## 50. Registros y auditoría

ENPASS podrá conservar registros necesarios para conciliación, reembolsos, contracargos, seguridad, acceso, facturación y cumplimiento legal, incluyendo ventas, precios, fees, estados de pagos, Tickets, accesos, modificaciones, usuarios administrativos, reembolsos y comunicaciones.

El Organizador podrá acceder a la información correspondiente dentro de los límites de sus permisos y de la normativa aplicable.

## 51. Conciliación económica

ENPASS deberá proporcionar herramientas o documentación suficiente para identificar razonablemente ventas brutas, Entradas vendidas, descuentos, reembolsos, contracargos, comisión ENPASS, operaciones canceladas, impuestos o retenciones informadas y otras partidas relevantes.

Las diferencias detectadas deberán comunicarse dentro de un plazo razonable.

## 52. Vigencia

La relación comenzará cuando el Organizador acepte estos Términos o suscriba las Condiciones Comerciales correspondientes.

Continuará vigente mientras mantenga una cuenta activa, existan Eventos, existan operaciones pendientes o subsistan obligaciones entre las partes.

## 53. Terminación

Cualquiera de las partes podrá finalizar la relación para futuros Eventos conforme a las condiciones acordadas.

La terminación no podrá utilizarse para abandonar obligaciones derivadas de Eventos ya comercializados.

Si existen Entradas vendidas, deberán resolverse adecuadamente realización, transferencias, accesos, reembolsos, contracargos, facturación y deudas.

## 54. Supervivencia de obligaciones

Luego de terminada la relación continuarán vigentes, cuando corresponda, las obligaciones relativas a pagos, deudas, reembolsos, contracargos, indemnidad, confidencialidad, protección de datos, propiedad intelectual, auditoría y derecho de repetición.

La baja de la cuenta no extingue obligaciones económicas anteriores.

## 55. Confidencialidad

Las partes deberán mantener confidencial la información comercial, técnica y estratégica no pública recibida como consecuencia de la relación.

No se considerará confidencial información que sea pública, haya sido obtenida legítimamente de terceros o deba revelarse por obligación legal.

## 56. Modificaciones

ENPASS podrá actualizar estos Términos cuando existan cambios legales, regulatorios, tecnológicos, operativos o financieros.

Las modificaciones sustanciales deberán ser comunicadas al Organizador.

Cuando resulte necesario, ENPASS solicitará una nueva aceptación.

Los cambios no alterarán retroactivamente obligaciones económicas ya perfeccionadas salvo acuerdo entre las partes o norma aplicable.

## 57. Condiciones Comerciales particulares

Las partes podrán acordar Condiciones Comerciales específicas para un Organizador o Evento, incluyendo fee ENPASS, costos fijos, servicios presenciales, personal, scanners, POS, cortesías, plazos de facturación, distribución de costos extraordinarios, garantías, reservas y beneficios comerciales.

En caso de contradicción exclusivamente comercial entre estos Términos y una Condición Comercial firmada posteriormente, prevalecerá la Condición Comercial particular respecto de ese punto.

No podrá utilizarse una Condición Comercial para eliminar obligaciones legales frente a consumidores.

## 58. Aceptación electrónica

El Organizador podrá aceptar este Acuerdo electrónicamente.

ENPASS podrá conservar evidencia de identidad, representante, fecha y hora, versión aceptada, documento, IP, dispositivo, usuario y registro técnico de aceptación.

Cuando el Organizador sea una persona jurídica, quien acepte declara contar con facultades suficientes para obligarla.

ENPASS podrá solicitar documentación adicional que acredite dichas facultades.

## 59. Notificaciones

Las comunicaciones contractuales podrán realizarse mediante panel de productor, correo electrónico registrado, mecanismos electrónicos acordados o notificación fehaciente cuando resulte necesaria.

El Organizador deberá mantener actualizados sus datos de contacto.

## 60. Legislación y jurisdicción

El presente Acuerdo comercial se regirá por las leyes de la República Argentina.

Cuando la relación sea celebrada entre ENPASS y un Organizador actuando profesionalmente y no resulte una relación de consumo, las partes podrán acordar la jurisdicción de los tribunales ordinarios competentes de la Provincia de Mendoza, con renuncia a cualquier otro fuero que pudiera corresponder, salvo competencia obligatoria establecida por ley.

Esta cláusula no modifica ni limita la jurisdicción ni los derechos correspondientes a los Compradores o consumidores finales.

## 61. Integración contractual

La relación entre ENPASS y el Organizador estará compuesta por estos Términos para Organizadores, las Condiciones Comerciales particulares, las políticas operativas expresamente incorporadas, los anexos firmados y las normas obligatorias aplicables.

La Política de Reembolsos pública de ENPASS deberá considerarse al determinar las obligaciones frente a Compradores.

## 62. Contacto

**ENPASS**
Razón social: **[●]**
CUIT: **[●]**
Domicilio: **[●]**
Correo contractual: **[●]**
Correo de soporte: **[●]**

---

**ENPASS - Tecnología para que el Evento funcione antes, durante y después de la puerta.**
$organizer_v1$)) as doc(content);
