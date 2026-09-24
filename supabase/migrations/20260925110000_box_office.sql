-- ENPASS Taquilla / Box Office: in-person ticket sales on top of the existing POS
-- (sales_locations = cajas, pos_device_* = dispositivos, pos_sessions = sesiones de caja,
-- pos_cash_movements = libro de movimientos). Tickets, stock, ledger and invoices go through
-- the same online pipeline (create_guest_checkout_internal + process_payment_update).

alter table public.orders add column cashier_user_id uuid references auth.users(id) on delete set null;
alter table public.pos_device_authorizations add column cashier_user_id uuid references auth.users(id) on delete set null;

-- Box-office orders carry the POS context AND a customer (the buyer, needed for tickets and invoices).
alter table public.orders drop constraint orders_pos_context_check;
alter table public.orders add constraint orders_pos_context_check check (
  (channel = 'pos' and customer_id is null and promoter_id is null and event_promoter_id is null
    and sales_location_id is not null and pos_session_id is not null and pos_idempotency_key is not null)
  or (channel = 'box_office' and customer_id is not null and promoter_id is null and event_promoter_id is null
    and sales_location_id is not null and pos_session_id is not null and pos_idempotency_key is not null)
  or (channel not in ('pos', 'box_office') and customer_id is not null and sales_location_id is null
    and pos_session_id is null and pos_idempotency_key is null)
);
create unique index orders_box_office_idempotency_unique
  on public.orders (pos_session_id, pos_idempotency_key) where channel = 'box_office';
create index orders_box_office_event_idx on public.orders (event_id, created_at desc) where channel = 'box_office';

-- ---------------------------------------------------------------------------------------------
-- Configuration tables (writes only through the RPCs below)
-- ---------------------------------------------------------------------------------------------
create table public.event_box_office_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  cash_enabled boolean not null default true,
  qr_enabled boolean not null default false,
  debit_enabled boolean not null default false,
  credit_enabled boolean not null default false,
  transfer_enabled boolean not null default false,
  other_enabled boolean not null default false,
  allow_after_start boolean not null default true,
  closes_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.ticket_type_channel_prices (
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  channel text not null check (channel in ('box_office')),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  price_amount bigint not null check (price_amount >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (ticket_type_id, channel)
);

create table public.fee_policies (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'organization', 'event')),
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  channel text not null check (channel in ('box_office')),
  fee_type text not null check (fee_type in ('percentage', 'fixed')),
  fee_value bigint not null check (fee_value >= 0), -- percentage: basis points; fixed: minor units per ticket
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (scope = 'global' and organization_id is null and event_id is null)
    or (scope = 'organization' and organization_id is not null and event_id is null)
    or (scope = 'event' and organization_id is not null and event_id is not null)
  ),
  check (fee_type <> 'percentage' or fee_value <= 10000)
);
create unique index fee_policies_active_unique on public.fee_policies (
  scope, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid), channel
) where active;

create table public.box_office_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('cashier', 'supervisor')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_box_office_settings enable row level security;
alter table public.ticket_type_channel_prices enable row level security;
alter table public.fee_policies enable row level security;
alter table public.box_office_staff enable row level security;
create policy box_office_settings_manager_select on public.event_box_office_settings
  for select using (public.can_manage_org(organization_id));
create policy box_office_prices_manager_select on public.ticket_type_channel_prices
  for select using (public.can_manage_org(organization_id));
create policy fee_policies_manager_select on public.fee_policies
  for select using (public.can_manage_org(organization_id));
create policy box_office_staff_select on public.box_office_staff
  for select using (public.can_manage_org(organization_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_supervise_box_office(target_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event
      and (public.can_manage_org(e.organization_id)
        or exists (select 1 from public.box_office_staff s
          where s.event_id = e.id and s.user_id = auth.uid() and s.role = 'supervisor'))
  );
$$;

-- Fee for a box-office sale. Priority: event policy > organization policy > global policy >
-- the organization's standard service fee (same as online). Nothing is hardcoded here.
create or replace function public.resolve_box_office_fee(target_event uuid, target_subtotal bigint, target_quantity integer)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  event_row public.events;
  org_row public.organizations;
  policy_row public.fee_policies;
begin
  select * into event_row from public.events where id = target_event;
  select * into org_row from public.organizations where id = event_row.organization_id;
  if org_row.fee_payer <> 'buyer' then return 0; end if;
  select * into policy_row from public.fee_policies p
  where p.active and p.channel = 'box_office' and (
    (p.scope = 'event' and p.event_id = target_event)
    or (p.scope = 'organization' and p.organization_id = event_row.organization_id)
    or p.scope = 'global')
  order by case p.scope when 'event' then 0 when 'organization' then 1 else 2 end
  limit 1;
  if found then
    if policy_row.fee_type = 'percentage' then
      return round(target_subtotal * policy_row.fee_value::numeric / 10000)::bigint;
    end if;
    return policy_row.fee_value * target_quantity;
  end if;
  return round(target_subtotal * org_row.service_fee_bps::numeric / 10000)::bigint;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Configuration RPCs (authenticated managers; fee policies: platform admin only)
-- ---------------------------------------------------------------------------------------------
create or replace function public.upsert_box_office_settings(
  target_event uuid, target_enabled boolean, target_cash boolean, target_qr boolean,
  target_debit boolean, target_credit boolean, target_transfer boolean, target_other boolean,
  target_allow_after_start boolean, target_closes_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if auth.uid() is null or not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.event_box_office_settings as s (
    event_id, organization_id, enabled, cash_enabled, qr_enabled, debit_enabled, credit_enabled,
    transfer_enabled, other_enabled, allow_after_start, closes_at
  ) values (
    target_event, event_row.organization_id, target_enabled, target_cash, target_qr, target_debit,
    target_credit, target_transfer, target_other, target_allow_after_start, target_closes_at
  ) on conflict (event_id) do update set
    enabled = excluded.enabled, cash_enabled = excluded.cash_enabled, qr_enabled = excluded.qr_enabled,
    debit_enabled = excluded.debit_enabled, credit_enabled = excluded.credit_enabled,
    transfer_enabled = excluded.transfer_enabled, other_enabled = excluded.other_enabled,
    allow_after_start = excluded.allow_after_start, closes_at = excluded.closes_at, updated_at = now();
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'box_office.settings.updated', 'event', target_event,
    jsonb_build_object('enabled', target_enabled));
end;
$$;

create or replace function public.set_box_office_ticket_price(
  target_ticket_type uuid, target_price_amount bigint, target_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare type_row public.ticket_types;
begin
  select * into type_row from public.ticket_types where id = target_ticket_type;
  if auth.uid() is null or not found or not public.can_manage_org(type_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_price_amount is null and target_enabled then
    delete from public.ticket_type_channel_prices where ticket_type_id = target_ticket_type and channel = 'box_office';
  else
    insert into public.ticket_type_channel_prices (ticket_type_id, channel, organization_id, event_id, price_amount, enabled)
    values (target_ticket_type, 'box_office', type_row.organization_id, type_row.event_id,
      coalesce(target_price_amount, type_row.price_amount), target_enabled)
    on conflict (ticket_type_id, channel) do update
    set price_amount = excluded.price_amount, enabled = excluded.enabled, updated_at = now();
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (type_row.organization_id, auth.uid(), 'box_office.price.updated', 'ticket_type', target_ticket_type,
    jsonb_build_object('price_amount', target_price_amount, 'enabled', target_enabled));
end;
$$;

create or replace function public.set_fee_policy(
  target_scope text, target_organization uuid, target_event uuid, target_fee_type text, target_fee_value bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.fee_policies set active = false
  where active and channel = 'box_office' and scope = target_scope
    and organization_id is not distinct from target_organization and event_id is not distinct from target_event;
  insert into public.fee_policies (scope, organization_id, event_id, channel, fee_type, fee_value, created_by)
  values (target_scope, target_organization, target_event, 'box_office', target_fee_type, target_fee_value, auth.uid())
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.add_box_office_staff(target_event uuid, target_email text, target_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare event_row public.events; staff_user uuid;
begin
  select * into event_row from public.events where id = target_event;
  if auth.uid() is null or not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_role not in ('cashier', 'supervisor') then raise exception 'INVALID_ROLE' using errcode = 'P0001'; end if;
  select id into staff_user from auth.users where lower(email) = lower(trim(target_email));
  if staff_user is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.box_office_staff (event_id, user_id, organization_id, role, created_by)
  values (target_event, staff_user, event_row.organization_id, target_role, auth.uid())
  on conflict (event_id, user_id) do update set role = excluded.role;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'box_office.staff.added', 'event', target_event,
    jsonb_build_object('user_id', staff_user, 'role', target_role));
  return staff_user;
end;
$$;

create or replace function public.remove_box_office_staff(target_event uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if auth.uid() is null or not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.box_office_staff where event_id = target_event and user_id = target_user;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'box_office.staff.removed', 'event', target_event,
    jsonb_build_object('user_id', target_user));
end;
$$;

create or replace function public.set_pos_device_cashier(target_authorization uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare auth_row public.pos_device_authorizations;
begin
  select * into auth_row from public.pos_device_authorizations where id = target_authorization;
  if auth.uid() is null or not found or not public.can_manage_org(auth_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_user is not null and not (
    exists (select 1 from public.box_office_staff s where s.event_id = auth_row.event_id and s.user_id = target_user)
    or exists (select 1 from public.organization_members m where m.organization_id = auth_row.organization_id and m.user_id = target_user)
  ) then
    raise exception 'CASHIER_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  update public.pos_device_authorizations set cashier_user_id = target_user where id = target_authorization;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (auth_row.organization_id, auth.uid(), 'pos_device.cashier_assigned', 'pos_device', target_authorization,
    jsonb_build_object('cashier_user_id', target_user));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Device-session RPCs (called with the service role from the POS API, like the bar POS)
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_box_office_config(target_session_hash text)
returns table (
  enabled boolean, cash_enabled boolean, qr_enabled boolean, debit_enabled boolean, credit_enabled boolean,
  transfer_enabled boolean, other_enabled boolean, cashier_user_id uuid
) language sql stable security definer set search_path = '' as $$
  select coalesce(s.enabled, false) and e.pos_enabled and e.tickets_enabled,
    coalesce(s.cash_enabled, true), coalesce(s.qr_enabled, false), coalesce(s.debit_enabled, false),
    coalesce(s.credit_enabled, false), coalesce(s.transfer_enabled, false), coalesce(s.other_enabled, false),
    a.cashier_user_id
  from public.pos_device_sessions ds
  join public.pos_device_authorizations a on a.id = ds.authorization_id
  join public.events e on e.id = ds.event_id
  left join public.event_box_office_settings s on s.event_id = ds.event_id
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
$$;

create or replace function public.get_box_office_catalog(target_session_hash text)
returns table (
  ticket_type_id uuid, name text, description text, currency char(3), unit_price_amount bigint,
  online_price_amount bigint, available_quantity bigint, max_per_order integer, sale_open boolean
) language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.description, t.currency,
    case when cp.enabled then cp.price_amount else t.price_amount end,
    t.price_amount, t.available_quantity, t.max_per_order, t.sale_open
  from public.pos_device_sessions ds
  join public.event_box_office_settings s on s.event_id = ds.event_id and s.enabled
  join public.get_public_ticket_types(ds.event_id) t on true
  left join public.ticket_type_channel_prices cp on cp.ticket_type_id = t.id and cp.channel = 'box_office'
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now()
    and (cp.ticket_type_id is null or cp.enabled)
  order by t.sort_order;
$$;

create or replace function public.quote_box_office_sale(
  target_session_hash text, target_ticket_type uuid, target_quantity integer
) returns table (unit_price_amount bigint, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint, currency char(3))
language plpgsql stable security definer set search_path = '' as $$
declare unit_price bigint; type_currency char(3); fee bigint; event_uuid uuid;
begin
  select ds.event_id into event_uuid from public.pos_device_sessions ds
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now();
  if event_uuid is null then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  if target_quantity < 1 or target_quantity > 99 then raise exception 'INVALID_QUANTITY' using errcode = 'P0001'; end if;
  select case when cp.ticket_type_id is not null and cp.enabled then cp.price_amount
      when cp.ticket_type_id is not null then null else t.price_amount end, t.currency
  into unit_price, type_currency
  from public.ticket_types t
  left join public.ticket_type_channel_prices cp on cp.ticket_type_id = t.id and cp.channel = 'box_office'
  where t.id = target_ticket_type and t.event_id = event_uuid and t.active;
  if unit_price is null then raise exception 'TICKET_NOT_AVAILABLE_AT_BOX_OFFICE' using errcode = 'P0001'; end if;
  fee := public.resolve_box_office_fee(event_uuid, unit_price * target_quantity, target_quantity);
  return query select unit_price, unit_price * target_quantity, fee, unit_price * target_quantity + fee, type_currency;
end;
$$;

-- Step 1: reserve stock and create a PENDING order + manual payment. No valid ticket exists yet.
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

  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, idempotency_key, attempt_number, status,
    currency, gross_amount, service_fee_amount, method
  ) values (
    created_order.organization_id, created_order.id, null, 'manual', target_idempotency_key, 1, 'pending',
    created_order.currency, created_order.total_amount, created_order.service_fee_amount, 'cash'
  );
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (created_order.organization_id, auth_row.cashier_user_id, 'box_office.sale.created', 'order', created_order.id,
    jsonb_build_object('event_id', event_row.id, 'pos_session_id', cash_session.id, 'device_id', auth_row.id,
      'ticket_type_id', target_ticket_type, 'quantity', target_quantity, 'total', created_order.total_amount));
  return query select created_order.id, created_order.public_id, created_order.subtotal_amount,
    created_order.service_fee_amount, created_order.total_amount, created_order.currency, false;
end;
$$;

-- Step 2: the cashier confirms the money was received. Only now the order becomes PAID and
-- tickets can be issued (the same process_payment_update used by online payments).
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
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now();
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

  update public.payments set method = target_payment_method,
    external_reference = nullif(trim(target_external_reference), '') where id = payment_row.id;
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

-- A mistaken sale is never deleted: it is reversed (tickets voided, ledger/cash reversed, credit note).
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
  select * into cash_session from public.pos_sessions where id = order_row.pos_session_id for update;
  if cash_session.status <> 'open' then raise exception 'REGISTER_CLOSED' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments where order_id = order_row.id and provider = 'manual' for update;

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
-- Reporting (producer / supervisor / platform admin)
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_box_office_summary(target_event uuid)
returns table (
  cashier_user_id uuid, cashier_email text, sale_count bigint, ticket_count bigint, gmv_amount bigint,
  service_fee_amount bigint, cash_amount bigint, digital_amount bigint, voided_count bigint, voided_amount bigint
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
    count(*) filter (where o.status = 'refunded'),
    coalesce(sum(o.total_amount) filter (where o.status = 'refunded'), 0)::bigint
  from public.orders o
  left join auth.users u on u.id = o.cashier_user_id
  left join public.payments p on p.order_id = o.id and p.provider = 'manual'
  left join lateral (select sum(oi.quantity) as qty from public.order_items oi where oi.order_id = o.id) i on true
  where o.event_id = target_event and o.channel = 'box_office' and o.status in ('paid', 'refunded')
  group by o.cashier_user_id, u.email;
end;
$$;

create or replace function public.get_box_office_registers(target_event uuid)
returns table (
  pos_session_id uuid, location_name text, cashier_email text, operator_label text, status public.pos_session_status,
  opened_at timestamptz, closed_at timestamptz, opening_cash_amount bigint, expected_cash_amount bigint,
  counted_cash_amount bigint, difference_amount bigint, box_office_sales bigint
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
    (select count(*) from public.orders o where o.pos_session_id = ps.id and o.channel = 'box_office' and o.status = 'paid')::bigint
  from public.pos_sessions ps
  join public.sales_locations sl on sl.id = ps.sales_location_id
  join public.pos_device_authorizations a on a.id = ps.pos_device_id
  left join auth.users u on u.id = a.cashier_user_id
  where ps.event_id = target_event
  order by ps.opened_at desc;
end;
$$;

create or replace function public.get_box_office_sales(target_event uuid, target_limit integer default 50)
returns table (
  order_public_id text, created_at timestamptz, cashier_email text, payment_method public.pos_payment_method,
  ticket_count bigint, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint, status public.order_status,
  register_open boolean
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_supervise_box_office(target_event) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.public_id, o.created_at, u.email::text, p.method,
    (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = o.id)::bigint,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.status, ps.status = 'open'
  from public.orders o
  left join auth.users u on u.id = o.cashier_user_id
  left join public.payments p on p.order_id = o.id and p.provider = 'manual'
  left join public.pos_sessions ps on ps.id = o.pos_session_id
  where o.event_id = target_event and o.channel = 'box_office' and o.status in ('paid', 'refunded')
  order by o.created_at desc limit least(greatest(target_limit, 1), 200);
end;
$$;

-- Grants: device-session RPCs are service_role only; configuration/reporting RPCs are for signed-in users.
revoke all on function public.can_supervise_box_office(uuid) from public, anon;
revoke all on function public.resolve_box_office_fee(uuid, bigint, integer) from public, anon, authenticated;
revoke all on function public.upsert_box_office_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz) from public, anon;
revoke all on function public.set_box_office_ticket_price(uuid, bigint, boolean) from public, anon;
revoke all on function public.set_fee_policy(text, uuid, uuid, text, bigint) from public, anon;
revoke all on function public.add_box_office_staff(uuid, text, text) from public, anon;
revoke all on function public.remove_box_office_staff(uuid, uuid) from public, anon;
revoke all on function public.set_pos_device_cashier(uuid, uuid) from public, anon;
revoke all on function public.void_box_office_sale(text, text) from public, anon;
revoke all on function public.get_box_office_summary(uuid) from public, anon;
revoke all on function public.get_box_office_registers(uuid) from public, anon;
revoke all on function public.get_box_office_sales(uuid, integer) from public, anon;
grant execute on function public.can_supervise_box_office(uuid) to authenticated;
grant execute on function public.upsert_box_office_settings(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, timestamptz) to authenticated;
grant execute on function public.set_box_office_ticket_price(uuid, bigint, boolean) to authenticated;
grant execute on function public.set_fee_policy(text, uuid, uuid, text, bigint) to authenticated;
grant execute on function public.add_box_office_staff(uuid, text, text) to authenticated;
grant execute on function public.remove_box_office_staff(uuid, uuid) to authenticated;
grant execute on function public.set_pos_device_cashier(uuid, uuid) to authenticated;
grant execute on function public.void_box_office_sale(text, text) to authenticated;
grant execute on function public.get_box_office_summary(uuid) to authenticated;
grant execute on function public.get_box_office_registers(uuid) to authenticated;
grant execute on function public.get_box_office_sales(uuid, integer) to authenticated;

revoke all on function public.get_box_office_config(text) from public, anon, authenticated;
revoke all on function public.get_box_office_catalog(text) from public, anon, authenticated;
revoke all on function public.quote_box_office_sale(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.box_office_create_sale(text, uuid, uuid, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.box_office_confirm_sale(text, text, public.pos_payment_method, bigint, text) from public, anon, authenticated;
grant execute on function public.get_box_office_config(text) to service_role;
grant execute on function public.get_box_office_catalog(text) to service_role;
grant execute on function public.quote_box_office_sale(text, uuid, integer) to service_role;
grant execute on function public.box_office_create_sale(text, uuid, uuid, integer, text, text, text, text, text) to service_role;
grant execute on function public.box_office_confirm_sale(text, text, public.pos_payment_method, bigint, text) to service_role;
