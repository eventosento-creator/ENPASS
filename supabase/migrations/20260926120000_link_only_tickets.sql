-- Link-only tickets ("entrada por link"): a ticket type that is NOT listed on the public event page, has its own
-- private link/QR and is sold with the normal checkout inside an optional time window (sales_start / sales_end).
-- The regular listing (get_public_ticket_types) excludes them, so they never show up publicly, in discovery prices
-- or in the sequential "sale phase" logic. The checkout accepts one only when the request carries its token.

alter table public.ticket_types
  add column link_only boolean not null default false,
  add column link_token text unique,
  add constraint ticket_types_link_token_check check (link_only = (link_token is not null));

create or replace function public.get_public_ticket_types(target_event uuid)
returns table (
  id uuid, organization_id uuid, event_id uuid, name text, description text,
  price_amount bigint, currency char(3), quantity integer, max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, active boolean, sort_order integer,
  available_quantity bigint, sale_open boolean
)
language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      greatest(t.quantity - coalesce(sum(h.quantity) filter (
        where h.status = 'consumed' or (h.status = 'active' and h.expires_at > now())
      ), 0), 0)::bigint as available,
      coalesce(p.sort_order, t.sort_order) as phase_order
    from public.ticket_types t
    left join public.sale_phases p on p.id = t.sale_phase_id
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published' and e.tickets_enabled
    where t.event_id = target_event and t.active and t.publicly_available and not t.link_only
    group by t.id, p.sort_order
  ), open_phase as (
    select min(phase_order) as phase_order from inventory where available > 0
  )
  select i.id, i.organization_id, i.event_id, i.name, i.description, i.price_amount, i.currency,
    i.quantity, i.max_per_order, i.sales_start, i.sales_end, i.active, i.sort_order, i.available,
    (i.available > 0 and i.phase_order = o.phase_order
      and (i.sales_start is null or i.sales_start <= now())
      and (i.sales_end is null or i.sales_end > now()))
  from inventory i cross join open_phase o
  order by i.phase_order, i.sort_order;
$$;

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
        and (not link_only or (nullif(selection->>'link_token', '') is not null and link_token = selection->>'link_token'))
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
      if not type_row.link_only and not exists (
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

-- Public read of ONE link-only ticket type (needs its private token). Used by the link page and the checkout.
create or replace function public.get_link_ticket_type(target_event uuid, target_token text)
returns table (
  id uuid, name text, description text, price_amount bigint, currency char(3), max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, available_quantity bigint, sale_state text, sale_open boolean
) language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      greatest(t.quantity - coalesce(sum(h.quantity) filter (
        where h.status = 'consumed' or (h.status = 'active' and h.expires_at > now())
      ), 0), 0)::bigint as available
    from public.ticket_types t
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published' and e.tickets_enabled
    where t.event_id = target_event and t.link_only and t.active
      and target_token is not null and t.link_token = target_token
    group by t.id
  )
  select i.id, i.name, i.description, i.price_amount, i.currency, i.max_per_order, i.sales_start, i.sales_end, i.available,
    case
      when i.sales_start is not null and i.sales_start > now() then 'upcoming'
      when i.sales_end is not null and i.sales_end <= now() then 'ended'
      when i.available <= 0 then 'sold_out'
      else 'open'
    end,
    (i.available > 0 and (i.sales_start is null or i.sales_start <= now()) and (i.sales_end is null or i.sales_end > now()))
  from inventory i;
$$;
revoke all on function public.get_link_ticket_type(uuid, text) from public, anon, authenticated;
grant execute on function public.get_link_ticket_type(uuid, text) to anon, authenticated;

-- The app calls the checkout through the service role. Hosted Supabase grants it by default; local/CLI databases do not.
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to service_role;
