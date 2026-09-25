-- Box office phase 2: dynamic Mercado Pago QR (Checkout Pro preference + ENPASS-generated QR of its URL).
-- The native MP QR API has no marketplace_fee parameter, so the same Checkout Pro flow used online is reused:
-- OAuth seller token, marketplace_fee = service fee, webhook confirmation. Payment rows are created only when
-- money is actually being collected (QR checkout via prepare_payment_attempt, or manual cash at confirm).

alter table public.event_box_office_settings
  add column mp_qr_enabled boolean not null default false,
  add column qr_expiry_minutes integer not null default 10 check (qr_expiry_minutes between 3 and 30);

drop function public.upsert_box_office_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz);
create function public.upsert_box_office_settings(
  target_event uuid, target_enabled boolean, target_cash boolean, target_qr boolean,
  target_debit boolean, target_credit boolean, target_transfer boolean, target_other boolean,
  target_allow_after_start boolean, target_closes_at timestamptz, target_mp_qr boolean, target_qr_expiry integer
) returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if auth.uid() is null or not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_qr_expiry not between 3 and 30 then raise exception 'INVALID_EXPIRY' using errcode = 'P0001'; end if;
  insert into public.event_box_office_settings as s (
    event_id, organization_id, enabled, cash_enabled, qr_enabled, debit_enabled, credit_enabled,
    transfer_enabled, other_enabled, allow_after_start, closes_at, mp_qr_enabled, qr_expiry_minutes
  ) values (
    target_event, event_row.organization_id, target_enabled, target_cash, target_qr, target_debit,
    target_credit, target_transfer, target_other, target_allow_after_start, target_closes_at, target_mp_qr, target_qr_expiry
  ) on conflict (event_id) do update set
    enabled = excluded.enabled, cash_enabled = excluded.cash_enabled, qr_enabled = excluded.qr_enabled,
    debit_enabled = excluded.debit_enabled, credit_enabled = excluded.credit_enabled,
    transfer_enabled = excluded.transfer_enabled, other_enabled = excluded.other_enabled,
    allow_after_start = excluded.allow_after_start, closes_at = excluded.closes_at,
    mp_qr_enabled = excluded.mp_qr_enabled, qr_expiry_minutes = excluded.qr_expiry_minutes, updated_at = now();
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'box_office.settings.updated', 'event', target_event,
    jsonb_build_object('enabled', target_enabled, 'mp_qr', target_mp_qr));
end;
$$;
revoke all on function public.upsert_box_office_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz, boolean, integer) from public, anon;
grant execute on function public.upsert_box_office_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz, boolean, integer) to authenticated;

drop function public.get_box_office_config(text);
create function public.get_box_office_config(target_session_hash text)
returns table (
  enabled boolean, cash_enabled boolean, qr_enabled boolean, debit_enabled boolean, credit_enabled boolean,
  transfer_enabled boolean, other_enabled boolean, cashier_user_id uuid, mp_qr_ready boolean, qr_expiry_minutes integer
) language sql stable security definer set search_path = '' as $$
  select coalesce(s.enabled, false) and e.pos_enabled and e.tickets_enabled,
    coalesce(s.cash_enabled, true), coalesce(s.qr_enabled, false), coalesce(s.debit_enabled, false),
    coalesce(s.credit_enabled, false), coalesce(s.transfer_enabled, false), coalesce(s.other_enabled, false),
    a.cashier_user_id,
    coalesce(s.mp_qr_enabled, false) and exists (
      select 1 from public.payment_accounts pa
      where pa.organization_id = ds.organization_id and pa.provider = 'mercado_pago' and pa.status = 'connected'
        and pa.access_token_encrypted is not null),
    coalesce(s.qr_expiry_minutes, 10)
  from public.pos_device_sessions ds
  join public.pos_device_authorizations a on a.id = ds.authorization_id
  join public.events e on e.id = ds.event_id
  left join public.event_box_office_settings s on s.event_id = ds.event_id
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
$$;
revoke all on function public.get_box_office_config(text) from public, anon, authenticated;
grant execute on function public.get_box_office_config(text) to service_role;

create or replace function public.box_office_create_sale(
  target_session_hash text, target_idempotency_key uuid, target_ticket_type uuid, target_quantity integer,
  buyer_first_name text, buyer_last_name text, buyer_document text, buyer_email text, buyer_phone text
) returns table (
  order_id uuid, order_public_id text, subtotal_amount bigint, service_fee_amount bigint,
  total_amount bigint, currency char(3), reused boolean
) language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  auth_row public.pos_device_authorizations;
  cash_session public.pos_sessions;
  event_row public.events;
  settings_row public.event_box_office_settings;
  existing public.orders;
  type_row public.ticket_types;
  channel_price public.ticket_type_channel_prices;
  terms_doc public.legal_documents;
  refund_doc public.legal_documents;
  created_public_id text;
  created_order public.orders;
  unit_price bigint;
  new_subtotal bigint;
  new_fee bigint;
  buyer_email_value text;
  first_name_value text := coalesce(nullif(trim(buyer_first_name), ''), 'Consumidor');
  last_name_value text := coalesce(nullif(trim(buyer_last_name), ''), 'Final');
begin
  perform pg_advisory_xact_lock(hashtextextended(target_idempotency_key::text, 0));
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now() for update;
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into auth_row from public.pos_device_authorizations where id = device_session.authorization_id;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open' for update;
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = device_session.event_id;
  select * into settings_row from public.event_box_office_settings where event_id = device_session.event_id;
  if not found or not settings_row.enabled or not event_row.pos_enabled or not event_row.tickets_enabled
    or event_row.status <> 'published' then
    raise exception 'BOX_OFFICE_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if auth_row.cashier_user_id is null then raise exception 'CASHIER_REQUIRED' using errcode = 'P0001'; end if;
  if (settings_row.closes_at is not null and settings_row.closes_at <= now())
    or (not settings_row.allow_after_start and event_row.starts_at <= now()) then
    raise exception 'BOX_OFFICE_CLOSED' using errcode = 'P0001';
  end if;

  select * into existing from public.orders o
  where o.pos_session_id = cash_session.id and o.pos_idempotency_key = target_idempotency_key and o.channel = 'box_office';
  if found then
    return query select existing.id, existing.public_id, existing.subtotal_amount, existing.service_fee_amount,
      existing.total_amount, existing.currency, true;
    return;
  end if;

  select * into type_row from public.ticket_types where id = target_ticket_type and event_id = event_row.id;
  if not found then raise exception 'INVALID_SELECTION' using errcode = 'P0001'; end if;
  select * into channel_price from public.ticket_type_channel_prices
  where ticket_type_id = target_ticket_type and channel = 'box_office';
  if found and not channel_price.enabled then raise exception 'TICKET_NOT_AVAILABLE_AT_BOX_OFFICE' using errcode = 'P0001'; end if;
  unit_price := case when found then channel_price.price_amount else type_row.price_amount end;

  select * into terms_doc from public.legal_documents where type = 'terms_buyer' and status = 'active' limit 1;
  select * into refund_doc from public.legal_documents where type = 'refund_policy' and status = 'active' limit 1;
  buyer_email_value := coalesce(nullif(lower(trim(buyer_email)), ''),
    'puerta-' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12) || '@taquilla.enpass.invalid');

  select o.order_public_id into created_public_id from public.create_guest_checkout_internal(
    event_row.id, first_name_value, last_name_value, buyer_email_value, coalesce(buyer_phone, ''),
    coalesce(buyer_document, ''),
    jsonb_build_array(jsonb_build_object('item_type', 'ticket', 'item_id', target_ticket_type, 'quantity', target_quantity)),
    terms_doc.id, refund_doc.id
  ) o;

  new_subtotal := unit_price * target_quantity;
  new_fee := public.resolve_box_office_fee(event_row.id, new_subtotal, target_quantity);
  update public.order_items oi set unit_price_amount = unit_price, line_total_amount = unit_price * target_quantity
  where oi.order_id = (select id from public.orders where public_id = created_public_id);
  update public.orders o set channel = 'box_office', subtotal_amount = new_subtotal, service_fee_amount = new_fee,
    total_amount = new_subtotal + new_fee, sales_location_id = device_session.sales_location_id,
    pos_session_id = cash_session.id, pos_idempotency_key = target_idempotency_key,
    cashier_user_id = auth_row.cashier_user_id
  where o.public_id = created_public_id returning * into created_order;

  update public.orders set expires_at = now() + make_interval(mins => settings_row.qr_expiry_minutes)
  where id = created_order.id returning * into created_order;
  update public.ticket_holds th set expires_at = created_order.expires_at where th.order_id = created_order.id and th.status = 'active';
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (created_order.organization_id, auth_row.cashier_user_id, 'box_office.sale.created', 'order', created_order.id,
    jsonb_build_object('event_id', event_row.id, 'pos_session_id', cash_session.id, 'device_id', auth_row.id,
      'ticket_type_id', target_ticket_type, 'quantity', target_quantity, 'total', created_order.total_amount));
  return query select created_order.id, created_order.public_id, created_order.subtotal_amount,
    created_order.service_fee_amount, created_order.total_amount, created_order.currency, false;
end;
$$;

create or replace function public.box_office_confirm_sale(
  target_session_hash text, target_order_public_id text, target_payment_method public.pos_payment_method,
  target_cash_received_amount bigint default null, target_external_reference text default null
) returns table (
  order_id uuid, order_public_id text, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint,
  currency char(3), payment_method public.pos_payment_method, cash_received_amount bigint, change_amount bigint,
  already_confirmed boolean
) language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  auth_row public.pos_device_authorizations;
  cash_session public.pos_sessions;
  settings_row public.event_box_office_settings;
  order_row public.orders;
  payment_row public.payments;
  method_allowed boolean;
  process_result text;
  received bigint;
begin
  select * into device_session from public.pos_device_sessions ds
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into auth_row from public.pos_device_authorizations where id = device_session.authorization_id;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open' for update;
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select * into order_row from public.orders o
  where o.public_id = target_order_public_id and o.channel = 'box_office' and o.pos_session_id = cash_session.id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments p where p.order_id = order_row.id and p.provider = 'manual' for update;

  if order_row.status = 'paid' then
    return query select order_row.id, order_row.public_id, order_row.subtotal_amount, order_row.service_fee_amount,
      order_row.total_amount, order_row.currency, payment_row.method, null::bigint, 0::bigint, true;
    return;
  end if;
  if order_row.status <> 'pending' then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;

  select * into settings_row from public.event_box_office_settings where event_id = order_row.event_id;
  method_allowed := case target_payment_method
    when 'cash' then settings_row.cash_enabled when 'qr' then settings_row.qr_enabled
    when 'debit_card' then settings_row.debit_enabled when 'credit_card' then settings_row.credit_enabled
    when 'bank_transfer' then settings_row.transfer_enabled when 'other' then settings_row.other_enabled
    else false end;
  if not coalesce(method_allowed, false) then raise exception 'PAYMENT_METHOD_NOT_ALLOWED' using errcode = 'P0001'; end if;
  if target_payment_method = 'cash' then
    received := coalesce(target_cash_received_amount, 0);
    if received < order_row.total_amount then raise exception 'INSUFFICIENT_CASH' using errcode = 'P0001'; end if;
  else
    received := null;
  end if;

  -- Any dynamic QR checkout that is still open for this order is abandoned in favour of this manual collection.
  update public.payments pm set status = 'cancelled' where pm.order_id = order_row.id and pm.provider = 'mercado_pago' and pm.status = 'pending';
  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, idempotency_key, attempt_number, status,
    currency, gross_amount, service_fee_amount, method, external_reference
  ) values (
    order_row.organization_id, order_row.id, null, 'manual', extensions.gen_random_uuid(),
    coalesce((select max(p.attempt_number) from public.payments p where p.order_id = order_row.id), 0) + 1, 'pending',
    order_row.currency, order_row.total_amount, order_row.service_fee_amount, target_payment_method,
    nullif(trim(target_external_reference), '')
  ) returning * into payment_row;
  process_result := public.process_payment_update(
    payment_row.public_id, 'pos-' || payment_row.id::text, 'approved', 'approved', '',
    payment_row.gross_amount, payment_row.currency, 0, null, now(), 0
  );
  if process_result <> 'approved' then raise exception 'CONFIRM_FAILED:%', process_result using errcode = 'P0001'; end if;

  if target_payment_method = 'cash' and order_row.total_amount > 0 then
    insert into public.pos_cash_movements (organization_id, event_id, pos_session_id, type, amount, order_id, payment_id)
    values (order_row.organization_id, order_row.event_id, cash_session.id, 'sale', order_row.total_amount, order_row.id, payment_row.id);
  end if;
  -- The buyer fee was collected in the producer's hands (cash or an external terminal), not by ENPASS:
  -- the producer owes it to ENPASS, so it is booked against the producer's account.
  if order_row.service_fee_amount > 0 then
    insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description)
    values (order_row.organization_id, 'service_fee', -order_row.service_fee_amount, order_row.currency, order_row.id,
      payment_row.id, order_row.event_id, 'Cargo por servicio cobrado en taquilla (a liquidar a ENPASS)');
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, auth_row.cashier_user_id, 'box_office.sale.confirmed', 'order', order_row.id,
    jsonb_build_object('pos_session_id', cash_session.id, 'device_id', auth_row.id,
      'payment_method', target_payment_method, 'total', order_row.total_amount));
  return query select order_row.id, order_row.public_id, order_row.subtotal_amount, order_row.service_fee_amount,
    order_row.total_amount, order_row.currency, target_payment_method, received,
    case when target_payment_method = 'cash' then received - order_row.total_amount else 0 end, false;
end;
$$;

-- prepare_payment_attempt now labels box-office QR payments with method 'mercado_pago'.
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
  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, attempt_number,
    currency, gross_amount, service_fee_amount, platform_fee_amount, method
  ) values (
    order_row.organization_id, order_row.id, account_row.id, 'mercado_pago', next_attempt,
    order_row.currency, order_row.total_amount, order_row.service_fee_amount, order_row.service_fee_amount,
    case when order_row.channel = 'box_office' then 'mercado_pago'::public.pos_payment_method else null end
  ) returning * into payment_row;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    order_row.organization_id, 'payment.created', 'payment', payment_row.id,
    jsonb_build_object('attempt', payment_row.attempt_number, 'status', payment_row.status)
  );
  return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, false;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- QR flow helpers (device-session, service_role)
-- ---------------------------------------------------------------------------------------------
create or replace function public.box_office_prepare_qr(target_session_hash text, target_order_public_id text)
returns table (order_id uuid, total_amount bigint, service_fee_amount bigint, currency char(3), expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  cash_session public.pos_sessions;
  order_row public.orders;
  settings_row public.event_box_office_settings;
begin
  select * into device_session from public.pos_device_sessions ds
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open';
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select * into order_row from public.orders o
  where o.public_id = target_order_public_id and o.channel = 'box_office' and o.pos_session_id = cash_session.id;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'pending' or order_row.expires_at <= now() then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;
  select * into settings_row from public.event_box_office_settings where event_id = order_row.event_id;
  if not found or not settings_row.enabled or not settings_row.mp_qr_enabled then
    raise exception 'QR_NOT_ENABLED' using errcode = 'P0001';
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, order_row.cashier_user_id, 'box_office.qr.requested', 'order', order_row.id,
    jsonb_build_object('pos_session_id', cash_session.id, 'total', order_row.total_amount));
  return query select order_row.id, order_row.total_amount, order_row.service_fee_amount, order_row.currency, order_row.expires_at;
end;
$$;

-- Live status for the cashier screen. Also expires an unpaid order (releasing its stock hold) lazily.
create or replace function public.box_office_order_status(target_session_hash text, target_order_public_id text)
returns table (
  order_id uuid, order_status text, payment_status text, payment_detail text, payment_method public.pos_payment_method,
  total_amount bigint, expires_at timestamptz, seconds_left integer
) language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  cash_session public.pos_sessions;
  order_row public.orders;
  payment_row public.payments;
begin
  select * into device_session from public.pos_device_sessions ds
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into order_row from public.orders o
  where o.public_id = target_order_public_id and o.channel = 'box_office'
    and o.sales_location_id = device_session.sales_location_id and o.event_id = device_session.event_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status = 'pending' and order_row.expires_at <= now()
    and not exists (select 1 from public.payments p where p.order_id = order_row.id and p.status = 'processing') then
    update public.ticket_holds th set status = 'expired' where th.order_id = order_row.id and th.status = 'active';
    update public.orders o2 set status = 'expired' where o2.id = order_row.id returning * into order_row;
    update public.payments pm set status = 'cancelled' where pm.order_id = order_row.id and pm.status = 'pending';
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values (order_row.organization_id, 'box_office.sale.expired', 'order', order_row.id, '{}'::jsonb);
  end if;
  select * into payment_row from public.payments p where p.order_id = order_row.id order by p.attempt_number desc limit 1;
  return query select order_row.id, order_row.status::text, payment_row.status::text, payment_row.provider_status_detail,
    payment_row.method, order_row.total_amount, order_row.expires_at,
    greatest(0, extract(epoch from (order_row.expires_at - now()))::integer);
end;
$$;

create or replace function public.box_office_cancel_sale(target_session_hash text, target_order_public_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  cash_session public.pos_sessions;
  order_row public.orders;
begin
  select * into device_session from public.pos_device_sessions ds
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open';
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select * into order_row from public.orders o
  where o.public_id = target_order_public_id and o.channel = 'box_office' and o.pos_session_id = cash_session.id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status = 'cancelled' then return; end if;
  if order_row.status <> 'pending' then raise exception 'ORDER_NOT_CANCELLABLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payments p where p.order_id = order_row.id and p.status = 'processing') then
    raise exception 'PAYMENT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  update public.ticket_holds set status = 'cancelled' where order_id = order_row.id and status = 'active';
  update public.payments set status = 'cancelled' where order_id = order_row.id and status = 'pending';
  update public.orders set status = 'cancelled' where id = order_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, order_row.cashier_user_id, 'box_office.sale.cancelled', 'order', order_row.id,
    jsonb_build_object('pos_session_id', cash_session.id));
end;
$$;

revoke all on function public.box_office_prepare_qr(text, text) from public, anon, authenticated;
revoke all on function public.box_office_order_status(text, text) from public, anon, authenticated;
revoke all on function public.box_office_cancel_sale(text, text) from public, anon, authenticated;
grant execute on function public.box_office_prepare_qr(text, text) to service_role;
grant execute on function public.box_office_order_status(text, text) to service_role;
grant execute on function public.box_office_cancel_sale(text, text) to service_role;

-- MP-paid box-office sales are voided through the provider refund (webhook does the reversal), never in SQL.
create or replace function public.void_box_office_sale(target_order_public_id text, target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  payment_row public.payments;
  cash_session public.pos_sessions;
  process_result text;
begin
  if auth.uid() is null or char_length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  select * into order_row from public.orders where public_id = target_order_public_id and channel = 'box_office' for update;
  if not found or not public.can_supervise_box_office(order_row.event_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if order_row.status <> 'paid' then raise exception 'ORDER_NOT_PAID' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments
  where order_id = order_row.id and status in ('approved', 'partially_refunded') order by created_at desc limit 1 for update;
  if payment_row.provider <> 'manual' then raise exception 'USE_PROVIDER_REFUND' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions where id = order_row.pos_session_id for update;
  if cash_session.status <> 'open' then raise exception 'REGISTER_CLOSED' using errcode = 'P0001'; end if;

  process_result := public.process_payment_update(
    payment_row.public_id, payment_row.provider_payment_id, 'refunded', 'refunded', '',
    payment_row.gross_amount, payment_row.currency, 0, null, null, payment_row.gross_amount
  );
  if process_result <> 'refunded' then raise exception 'VOID_FAILED:%', process_result using errcode = 'P0001'; end if;

  if payment_row.method = 'cash' and order_row.total_amount > 0 then
    insert into public.pos_cash_movements (organization_id, event_id, pos_session_id, type, amount, order_id, payment_id, reason)
    values (order_row.organization_id, order_row.event_id, cash_session.id, 'refund', order_row.total_amount,
      order_row.id, payment_row.id, trim(target_reason));
  end if;
  if order_row.service_fee_amount > 0 then
    insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description)
    values (order_row.organization_id, 'service_fee', order_row.service_fee_amount, order_row.currency, order_row.id,
      payment_row.id, order_row.event_id, 'Reversión de cargo por servicio de taquilla');
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, auth.uid(), 'box_office.sale.voided', 'order', order_row.id,
    jsonb_build_object('reason', trim(target_reason), 'pos_session_id', cash_session.id, 'total', order_row.total_amount));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reporting: payment method breakdown that keeps cash separate from digital money
-- ---------------------------------------------------------------------------------------------
drop function public.get_box_office_summary(uuid);
create function public.get_box_office_summary(target_event uuid)
returns table (
  cashier_user_id uuid, cashier_email text, sale_count bigint, ticket_count bigint, gmv_amount bigint,
  service_fee_amount bigint, cash_amount bigint, digital_amount bigint, mp_amount bigint, card_amount bigint,
  transfer_amount bigint, voided_count bigint, voided_amount bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_supervise_box_office(target_event) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.cashier_user_id, u.email::text,
    count(*) filter (where o.status = 'paid'),
    coalesce(sum(i.qty) filter (where o.status = 'paid'), 0)::bigint,
    coalesce(sum(o.subtotal_amount) filter (where o.status = 'paid'), 0)::bigint,
    coalesce(sum(o.service_fee_amount) filter (where o.status = 'paid'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where o.status = 'paid' and p.method = 'cash'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where o.status = 'paid' and p.method <> 'cash'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where o.status = 'paid' and p.method = 'mercado_pago'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where o.status = 'paid' and p.method in ('debit_card', 'credit_card', 'card')), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where o.status = 'paid' and p.method = 'bank_transfer'), 0)::bigint,
    count(*) filter (where o.status = 'refunded'),
    coalesce(sum(o.total_amount) filter (where o.status = 'refunded'), 0)::bigint
  from public.orders o
  left join auth.users u on u.id = o.cashier_user_id
  left join lateral (select pm.method from public.payments pm where pm.order_id = o.id
    and pm.status in ('approved', 'partially_refunded', 'refunded') order by pm.created_at desc limit 1) p on true
  left join lateral (select sum(oi.quantity) as qty from public.order_items oi where oi.order_id = o.id) i on true
  where o.event_id = target_event and o.channel = 'box_office' and o.status in ('paid', 'refunded')
  group by o.cashier_user_id, u.email;
end;
$$;

drop function public.get_box_office_registers(uuid);
create function public.get_box_office_registers(target_event uuid)
returns table (
  pos_session_id uuid, location_name text, cashier_email text, operator_label text, status public.pos_session_status,
  opened_at timestamptz, closed_at timestamptz, opening_cash_amount bigint, expected_cash_amount bigint,
  counted_cash_amount bigint, difference_amount bigint, box_office_sales bigint,
  cash_sales_amount bigint, mp_amount bigint, card_amount bigint, transfer_amount bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_supervise_box_office(target_event) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select ps.id, sl.name, u.email::text, ps.operator_label, ps.status, ps.opened_at, ps.closed_at, ps.opening_cash_amount,
    case when ps.status = 'closed' then ps.closing_expected_cash_amount else
      (ps.opening_cash_amount + coalesce((select sum(m.amount) filter (where m.type in ('sale', 'cash_in'))
        - coalesce(sum(m.amount) filter (where m.type in ('refund', 'cash_out')), 0)
        from public.pos_cash_movements m where m.pos_session_id = ps.id), 0))::bigint end,
    ps.closing_counted_cash_amount, ps.closing_difference_amount,
    coalesce(t.sales, 0)::bigint, coalesce(t.cash, 0)::bigint, coalesce(t.mp, 0)::bigint,
    coalesce(t.card, 0)::bigint, coalesce(t.transfer, 0)::bigint
  from public.pos_sessions ps
  join public.sales_locations sl on sl.id = ps.sales_location_id
  join public.pos_device_authorizations a on a.id = ps.pos_device_id
  left join auth.users u on u.id = a.cashier_user_id
  left join lateral (
    select count(*) as sales,
      sum(o.total_amount) filter (where p.method = 'cash') as cash,
      sum(o.total_amount) filter (where p.method = 'mercado_pago') as mp,
      sum(o.total_amount) filter (where p.method in ('debit_card', 'credit_card', 'card')) as card,
      sum(o.total_amount) filter (where p.method = 'bank_transfer') as transfer
    from public.orders o
    left join lateral (select pm.method from public.payments pm where pm.order_id = o.id
      and pm.status in ('approved', 'partially_refunded') order by pm.created_at desc limit 1) p on true
    where o.pos_session_id = ps.id and o.channel = 'box_office' and o.status = 'paid'
  ) t on true
  where ps.event_id = target_event
  order by ps.opened_at desc;
end;
$$;

drop function public.get_box_office_sales(uuid, integer);
create function public.get_box_office_sales(target_event uuid, target_limit integer default 50)
returns table (
  order_public_id text, created_at timestamptz, cashier_email text, payment_method public.pos_payment_method,
  ticket_count bigint, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint, status public.order_status,
  register_open boolean, payment_provider text
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_supervise_box_office(target_event) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.public_id, o.created_at, u.email::text, p.method,
    (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = o.id)::bigint,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.status, ps.status = 'open', p.provider
  from public.orders o
  left join auth.users u on u.id = o.cashier_user_id
  left join lateral (select pm.method, pm.provider from public.payments pm where pm.order_id = o.id
    and pm.status in ('approved', 'partially_refunded', 'refunded') order by pm.created_at desc limit 1) p on true
  left join public.pos_sessions ps on ps.id = o.pos_session_id
  where o.event_id = target_event and o.channel = 'box_office' and o.status in ('paid', 'refunded')
  order by o.created_at desc limit least(greatest(target_limit, 1), 200);
end;
$$;

revoke all on function public.get_box_office_summary(uuid) from public, anon;
revoke all on function public.get_box_office_registers(uuid) from public, anon;
revoke all on function public.get_box_office_sales(uuid, integer) from public, anon;
grant execute on function public.get_box_office_summary(uuid) to authenticated;
grant execute on function public.get_box_office_registers(uuid) to authenticated;
grant execute on function public.get_box_office_sales(uuid, integer) to authenticated;
