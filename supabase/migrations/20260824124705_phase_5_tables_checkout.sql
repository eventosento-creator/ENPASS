create or replace function public.create_guest_checkout_internal(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb
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
  requested integer;
  type_reserved bigint;
  event_reserved bigint;
  ticket_subtotal bigint := 0;
  table_subtotal bigint := 0;
  table_fee bigint := 0;
  subtotal bigint := 0;
  fee bigint := 0;
  expiry timestamptz := now() + interval '10 minutes';
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
begin
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
    else
      raise exception 'INVALID_SELECTION' using errcode = 'P0001';
    end if;
    if event_reserved > event_row.capacity then
      raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001';
    end if;
  end loop;

  subtotal := ticket_subtotal + table_subtotal;
  if org_row.fee_payer = 'buyer' then
    fee := round(ticket_subtotal * org_row.service_fee_bps::numeric / 10000)::bigint + table_fee;
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
    else
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
    end if;
  end loop;

  return query select generated_public_id, expiry;
end;
$$;

create or replace function public.create_guest_checkout(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb
)
returns table (order_public_id text, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select * from public.create_guest_checkout_internal(
    target_event, buyer_first_name, buyer_last_name, buyer_email,
    buyer_phone, buyer_document, selections
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
  target_attribution_session_hash text
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
    buyer_phone, buyer_document, selections
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

create or replace function public.prepare_payment_attempt(target_order_public_id text)
returns table (
  payment_id uuid,
  payment_public_id text,
  payment_account_id uuid,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  account_row public.payment_accounts;
  payment_row public.payments;
  next_attempt integer;
  configured_platform_fee bigint;
begin
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.ticket_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.table_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.orders set status = 'expired' where id = order_row.id;
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if order_row.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.ticket_holds
    where order_id = order_row.id and status = 'active' and expires_at > now()
  ) and not exists (
    select 1 from public.table_holds
    where order_id = order_row.id and status = 'active' and expires_at > now()
  ) then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  select * into account_row
  from public.payment_accounts
  where organization_id = order_row.organization_id
    and provider = 'mercado_pago' and status = 'connected'
    and access_token_encrypted is not null
  for update;
  if not found then raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;
  select * into payment_row
  from public.payments
  where order_id = order_row.id and status in ('pending', 'processing')
  order by created_at desc limit 1 for update;
  if found then
    return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, true;
    return;
  end if;
  select coalesce(max(p.attempt_number), 0) + 1 into next_attempt
  from public.payments p where p.order_id = order_row.id;
  select round(order_row.subtotal_amount * o.platform_fee_bps::numeric / 10000)::bigint
  into configured_platform_fee from public.organizations o where o.id = order_row.organization_id;
  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, attempt_number,
    currency, gross_amount, service_fee_amount, platform_fee_amount
  ) values (
    order_row.organization_id, order_row.id, account_row.id, 'mercado_pago', next_attempt,
    order_row.currency, order_row.total_amount, order_row.service_fee_amount, configured_platform_fee
  ) returning * into payment_row;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    order_row.organization_id, 'payment.created', 'payment', payment_row.id,
    jsonb_build_object('attempt', payment_row.attempt_number, 'status', payment_row.status)
  );
  return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, false;
end;
$$;

create or replace function public.get_public_order(target_public_id text)
returns table (
  public_id text,
  event_name text,
  event_slug text,
  event_cover_url text,
  status public.order_status,
  subtotal_amount bigint,
  service_fee_amount bigint,
  total_amount bigint,
  currency char(3),
  expires_at timestamptz,
  items jsonb,
  payment_public_id text,
  payment_status public.payment_status,
  payment_requires_action boolean,
  payment_updated_at timestamptz,
  payment_account_connected boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
begin
  select o.id into target_order_id from public.orders o
  where o.public_id = target_public_id for update;
  if not found then return; end if;
  update public.ticket_holds h set status = 'expired'
  where h.order_id = target_order_id and h.status = 'active' and h.expires_at <= now();
  update public.table_holds h set status = 'expired'
  where h.order_id = target_order_id and h.status = 'active' and h.expires_at <= now();
  update public.orders o set status = 'expired'
  where o.id = target_order_id and o.status = 'pending' and o.expires_at <= now();
  return query
  select o.public_id, e.name, e.slug, e.cover_image_url, o.status,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.currency, o.expires_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', i.item_name,
      'quantity', i.quantity,
      'unit_price_amount', i.unit_price_amount,
      'item_type', i.item_type,
      'event_table_id', i.event_table_id
    ) order by i.created_at), '[]'::jsonb),
    latest_payment.public_id, latest_payment.status,
    coalesce(latest_payment.requires_action, false), latest_payment.updated_at,
    exists (
      select 1 from public.payment_accounts a
      where a.organization_id = o.organization_id
        and a.provider = 'mercado_pago' and a.status = 'connected'
    )
  from public.orders o
  join public.events e on e.id = o.event_id
  join public.order_items i on i.order_id = o.id
  left join lateral (
    select p.public_id, p.status, p.requires_action, p.updated_at
    from public.payments p where p.order_id = o.id
    order by p.created_at desc limit 1
  ) latest_payment on true
  where o.id = target_order_id
  group by o.id, e.name, e.slug, e.cover_image_url,
    latest_payment.public_id, latest_payment.status,
    latest_payment.requires_action, latest_payment.updated_at;
end;
$$;

revoke all on function public.create_guest_checkout_internal(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.prepare_payment_attempt(text) from public, anon, authenticated;
revoke all on function public.get_public_order(text) from public, anon, authenticated;

grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.prepare_payment_attempt(text) to service_role;
grant execute on function public.get_public_order(text) to anon, authenticated;
