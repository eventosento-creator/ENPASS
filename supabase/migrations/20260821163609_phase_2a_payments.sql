drop function if exists public.get_public_order(text);

create type public.order_status_v2 as enum ('pending', 'paid', 'expired', 'cancelled', 'refunded');
alter table public.orders alter column status drop default;
alter table public.orders
  alter column status type public.order_status_v2
  using status::text::public.order_status_v2;
drop type public.order_status;
alter type public.order_status_v2 rename to order_status;
alter table public.orders alter column status set default 'pending'::public.order_status;

create type public.payment_account_status as enum ('pending', 'connected', 'expired', 'disconnected', 'error');
create type public.payment_status as enum (
  'pending',
  'processing',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'partially_refunded',
  'charged_back',
  'approved_inventory_conflict',
  'approved_duplicate_charge',
  'error'
);
create type public.webhook_event_status as enum ('received', 'processing', 'processed', 'failed', 'duplicate');

alter table public.organizations
  add column platform_fee_bps integer not null default 0
  check (platform_fee_bps between 0 and 10000);

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago')),
  provider_account_id text,
  provider_public_key text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_scope text,
  live_mode boolean not null default false,
  expires_at timestamptz,
  status public.payment_account_status not null default 'pending',
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  check (
    status <> 'connected'
    or (provider_account_id is not null and access_token_encrypted is not null and connected_at is not null)
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  provider text not null check (provider in ('mercado_pago')),
  provider_preference_id text,
  provider_payment_id text,
  idempotency_key uuid not null default gen_random_uuid() unique,
  attempt_number integer not null check (attempt_number > 0),
  status public.payment_status not null default 'pending',
  currency char(3) not null,
  gross_amount bigint not null check (gross_amount >= 0),
  service_fee_amount bigint not null check (service_fee_amount >= 0),
  platform_fee_amount bigint not null default 0 check (platform_fee_amount >= 0),
  processor_fee_amount bigint not null default 0 check (processor_fee_amount >= 0),
  seller_net_amount bigint check (seller_net_amount is null or seller_net_amount >= 0),
  provider_status text,
  provider_status_detail text,
  checkout_url text,
  sandbox_checkout_url text,
  requires_action boolean not null default false,
  exception_code text,
  approved_at timestamptz,
  rejected_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt_number),
  check (platform_fee_amount <= gross_amount)
);

create unique index payments_provider_payment_unique
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index payments_order_open_unique
  on public.payments(order_id)
  where status in ('pending', 'processing');
create index payments_organization_created_idx on public.payments(organization_id, created_at desc);
create index payments_order_created_idx on public.payments(order_id, created_at desc);
create index payments_account_idx on public.payments(payment_account_id);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null check (provider in ('mercado_pago')),
  provider_event_id text not null,
  provider_resource_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.webhook_event_status not null default 'received',
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index webhook_events_organization_received_idx on public.webhook_events(organization_id, received_at desc);
create index webhook_events_payment_idx on public.webhook_events(payment_id);
create index payment_accounts_provider_account_idx on public.payment_accounts(provider, provider_account_id)
  where provider_account_id is not null;

create trigger payment_accounts_touch before update on public.payment_accounts
for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments
for each row execute function public.touch_updated_at();
create trigger webhook_events_touch before update on public.webhook_events
for each row execute function public.touch_updated_at();

alter table public.payment_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;

create policy payment_accounts_manager_select on public.payment_accounts
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy payments_manager_select on public.payments
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy webhook_events_manager_select on public.webhook_events
for select to authenticated
using (organization_id is not null and (select public.can_manage_org(organization_id)));

grant select on public.payments, public.webhook_events to authenticated;

create function public.get_payment_account_status(target_organization uuid)
returns table (
  provider text,
  status public.payment_account_status,
  connected_at timestamptz,
  disconnected_at timestamptz,
  expires_at timestamptz,
  live_mode boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  select a.provider, a.status, a.connected_at, a.disconnected_at, a.expires_at, a.live_mode
  from public.payment_accounts a
  where a.organization_id = target_organization
  order by a.created_at desc
  limit 1;
end;
$$;

create function public.disconnect_payment_account(target_organization uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row public.payment_accounts;
begin
  if auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into account_row
  from public.payment_accounts
  where organization_id = target_organization and provider = 'mercado_pago'
  for update;

  if not found then
    return;
  end if;

  update public.payment_accounts
  set status = 'disconnected',
      access_token_encrypted = null,
      refresh_token_encrypted = null,
      disconnected_at = now(),
      expires_at = null
  where id = account_row.id;

  insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_organization, auth.uid(), 'oauth.disconnected', 'payment_account', account_row.id);
end;
$$;

create function public.prepare_payment_attempt(target_order_public_id text)
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
  select * into order_row
  from public.orders
  where public_id = target_order_public_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.ticket_holds set status = 'expired'
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
  ) then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;

  select * into account_row
  from public.payment_accounts
  where organization_id = order_row.organization_id
    and provider = 'mercado_pago'
    and status = 'connected'
    and access_token_encrypted is not null
  for update;

  if not found then
    raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001';
  end if;

  select * into payment_row
  from public.payments
  where order_id = order_row.id and status in ('pending', 'processing')
  order by created_at desc
  limit 1
  for update;

  if found then
    return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, true;
    return;
  end if;

  select coalesce(max(p.attempt_number), 0) + 1
  into next_attempt
  from public.payments p
  where p.order_id = order_row.id;

  select round(order_row.subtotal_amount * o.platform_fee_bps::numeric / 10000)::bigint
  into configured_platform_fee
  from public.organizations o
  where o.id = order_row.organization_id;

  insert into public.payments(
    organization_id,
    order_id,
    payment_account_id,
    provider,
    attempt_number,
    currency,
    gross_amount,
    service_fee_amount,
    platform_fee_amount
  ) values (
    order_row.organization_id,
    order_row.id,
    account_row.id,
    'mercado_pago',
    next_attempt,
    order_row.currency,
    order_row.total_amount,
    order_row.service_fee_amount,
    configured_platform_fee
  ) returning * into payment_row;

  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
  values (
    order_row.organization_id,
    'payment.created',
    'payment',
    payment_row.id,
    jsonb_build_object('attempt', payment_row.attempt_number, 'status', payment_row.status)
  );

  return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, false;
end;
$$;

create function public.set_payment_checkout(
  target_payment_public_id text,
  target_preference_id text,
  target_checkout_url text,
  target_sandbox_checkout_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
begin
  select * into payment_row
  from public.payments
  where public_id = target_payment_public_id
  for update;

  if not found or payment_row.status <> 'pending' then
    raise exception 'PAYMENT_NOT_PENDING' using errcode = 'P0001';
  end if;

  if payment_row.provider_preference_id is not null
    and payment_row.provider_preference_id <> target_preference_id then
    raise exception 'PREFERENCE_ALREADY_SET' using errcode = 'P0001';
  end if;

  update public.payments
  set provider_preference_id = target_preference_id,
      checkout_url = target_checkout_url,
      sandbox_checkout_url = target_sandbox_checkout_url
  where id = payment_row.id;
end;
$$;

create function public.fail_payment_checkout(target_payment_public_id text, target_error_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
begin
  select * into payment_row
  from public.payments
  where public_id = target_payment_public_id
  for update;

  if not found or payment_row.status not in ('pending', 'processing') then
    return;
  end if;

  update public.payments
  -- The preference may exist even when its HTTP response was interrupted. Keep
  -- the attempt open so a retry uses the same provider idempotency key.
  set exception_code = left(target_error_code, 120)
  where id = payment_row.id;

  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
  values (
    payment_row.organization_id,
    'payment.create_failed',
    'payment',
    payment_row.id,
    jsonb_build_object('error_code', left(target_error_code, 120))
  );
end;
$$;

create function public.process_payment_update(
  target_payment_public_id text,
  target_provider_payment_id text,
  target_status public.payment_status,
  target_provider_status text,
  target_provider_status_detail text,
  target_gross_amount bigint,
  target_currency char(3),
  target_processor_fee_amount bigint,
  target_seller_net_amount bigint,
  target_approved_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  order_row public.orders;
  event_row public.events;
  approved_payment_id uuid;
  required_total bigint;
  event_used bigint;
  inventory_conflict boolean := false;
  hold_group record;
begin
  if target_status not in (
    'pending', 'processing', 'approved', 'rejected', 'cancelled',
    'refunded', 'partially_refunded', 'charged_back'
  ) then
    raise exception 'INVALID_PROVIDER_STATUS' using errcode = 'P0001';
  end if;

  select * into payment_row
  from public.payments
  where public_id = target_payment_public_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into order_row
  from public.orders
  where id = payment_row.order_id
  for update;

  select * into event_row
  from public.events
  where id = order_row.event_id
  for update;

  if exists (
    select 1 from public.payments p
    where p.provider = payment_row.provider
      and p.provider_payment_id = target_provider_payment_id
      and p.id <> payment_row.id
  ) then
    update public.payments
    set status = 'error', requires_action = true, exception_code = 'provider_payment_conflict'
    where id = payment_row.id;
    return 'provider_payment_conflict';
  end if;

  if target_gross_amount <> payment_row.gross_amount or target_currency <> payment_row.currency then
    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
        provider_status = target_provider_status,
        provider_status_detail = target_provider_status_detail,
        status = 'error',
        requires_action = true,
        exception_code = 'amount_or_currency_mismatch'
    where id = payment_row.id;

    insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
    values (
      payment_row.organization_id,
      'payment.amount_mismatch',
      'payment',
      payment_row.id,
      jsonb_build_object('expected_amount', payment_row.gross_amount, 'received_amount', target_gross_amount)
    );
    return 'amount_or_currency_mismatch';
  end if;

  if payment_row.status in (
    'approved', 'refunded', 'partially_refunded', 'charged_back',
    'approved_inventory_conflict', 'approved_duplicate_charge'
  ) and target_status in ('pending', 'processing', 'rejected', 'cancelled') then
    return 'ignored_stale_update';
  end if;

  if target_status = 'approved' then
    select p.id into approved_payment_id
    from public.payments p
    where p.order_id = order_row.id
      and p.id <> payment_row.id
      and p.status = 'approved'
    limit 1;

    if order_row.status = 'paid' then
      if payment_row.status = 'approved' and approved_payment_id is null then
        update public.payments
        set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
            provider_status = target_provider_status,
            provider_status_detail = target_provider_status_detail,
            processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
            seller_net_amount = target_seller_net_amount,
            approved_at = coalesce(approved_at, target_approved_at, now())
        where id = payment_row.id;
        return 'already_approved';
      end if;

      update public.payments
      set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
          provider_status = target_provider_status,
          provider_status_detail = target_provider_status_detail,
          status = 'approved_duplicate_charge',
          requires_action = true,
          exception_code = 'order_already_paid',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;

      insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id,
        'payment.duplicate_charge',
        'payment',
        payment_row.id,
        jsonb_build_object('order_id', order_row.id)
      );
      return 'approved_duplicate_charge';
    end if;

    update public.ticket_holds h
    set status = 'expired'
    from public.orders o
    where h.order_id = o.id
      and h.event_id = order_row.event_id
      and h.status = 'active'
      and h.expires_at <= now();

    update public.orders o
    set status = 'expired'
    where o.event_id = order_row.event_id
      and o.status = 'pending'
      and o.expires_at <= now();

    perform 1
    from public.ticket_types t
    where t.id in (
      select h.ticket_type_id from public.ticket_holds h where h.order_id = order_row.id
    )
    order by t.id
    for update;

    select coalesce(sum(h.quantity), 0)
    into required_total
    from public.ticket_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');

    if required_total = 0 or order_row.status not in ('pending', 'expired') then
      inventory_conflict := true;
    end if;

    select coalesce(sum(h.quantity), 0)
    into event_used
    from public.ticket_holds h
    where h.event_id = order_row.event_id
      and h.order_id <> order_row.id
      and (
        h.status = 'consumed'
        or (h.status = 'active' and h.expires_at > now())
      );

    if event_used + required_total > event_row.capacity then
      inventory_conflict := true;
    end if;

    for hold_group in
      select h.ticket_type_id, sum(h.quantity)::bigint as required_quantity
      from public.ticket_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      group by h.ticket_type_id
      order by h.ticket_type_id
    loop
      if (
        select coalesce(sum(other_holds.quantity), 0)
        from public.ticket_holds other_holds
        where other_holds.ticket_type_id = hold_group.ticket_type_id
          and other_holds.order_id <> order_row.id
          and (
            other_holds.status = 'consumed'
            or (other_holds.status = 'active' and other_holds.expires_at > now())
          )
      ) + hold_group.required_quantity > (
        select t.quantity from public.ticket_types t where t.id = hold_group.ticket_type_id
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    if inventory_conflict then
      update public.payments
      set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
          provider_status = target_provider_status,
          provider_status_detail = target_provider_status_detail,
          status = 'approved_inventory_conflict',
          requires_action = true,
          exception_code = 'inventory_unavailable_after_approval',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;

      update public.orders set status = 'expired'
      where id = order_row.id and status = 'pending';
      update public.ticket_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';

      insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id,
        'payment.approved_inventory_conflict',
        'payment',
        payment_row.id,
        jsonb_build_object('order_id', order_row.id, 'requires_refund', true)
      );
      return 'approved_inventory_conflict';
    end if;

    update public.ticket_holds
    set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');

    update public.orders
    set status = 'paid'
    where id = order_row.id;

    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
        provider_status = target_provider_status,
        provider_status_detail = target_provider_status_detail,
        status = 'approved',
        requires_action = false,
        exception_code = null,
        processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
        seller_net_amount = target_seller_net_amount,
        approved_at = coalesce(target_approved_at, now())
    where id = payment_row.id;

    insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
    values (
      payment_row.organization_id,
      'payment.approved',
      'payment',
      payment_row.id,
      jsonb_build_object('order_id', order_row.id)
    );
    insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
    values (
      payment_row.organization_id,
      'order.paid',
      'order',
      order_row.id,
      jsonb_build_object('payment_id', payment_row.id)
    );
    return 'approved';
  end if;

  update public.payments
  set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
      provider_status = target_provider_status,
      provider_status_detail = target_provider_status_detail,
      status = target_status,
      requires_action = target_status in ('partially_refunded', 'charged_back'),
      processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
      seller_net_amount = target_seller_net_amount,
      rejected_at = case when target_status = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
      refunded_at = case when target_status = 'refunded' then coalesce(refunded_at, now()) else refunded_at end
  where id = payment_row.id;

  if target_status = 'refunded' and order_row.status = 'paid' then
    update public.orders set status = 'refunded' where id = order_row.id;
    update public.ticket_holds set status = 'cancelled'
    where order_id = order_row.id and status = 'consumed';
  elsif order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.orders set status = 'expired' where id = order_row.id;
    update public.ticket_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
  end if;

  insert into public.audit_logs(organization_id, action, entity_type, entity_id, after_data)
  values (
    payment_row.organization_id,
    'payment.' || target_status::text,
    'payment',
    payment_row.id,
    jsonb_build_object('provider_status', target_provider_status)
  );

  return target_status::text;
end;
$$;

create or replace function public.get_public_ticket_types(target_event uuid)
returns table (
  id uuid, organization_id uuid, event_id uuid, name text, description text,
  price_amount bigint, currency char(3), quantity integer, max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, active boolean, sort_order integer,
  available_quantity bigint, sale_open boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with inventory as (
    select t.*,
      greatest(
        t.quantity - coalesce(sum(h.quantity) filter (
          where h.status = 'consumed'
            or (h.status = 'active' and h.expires_at > now())
        ), 0),
        0
      )::bigint as available,
      coalesce(p.sort_order, t.sort_order) as phase_order
    from public.ticket_types t
    left join public.sale_phases p on p.id = t.sale_phase_id
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published'
    where t.event_id = target_event and t.active and t.publicly_available
    group by t.id, p.sort_order
  ), open_phase as (
    select min(phase_order) as phase_order from inventory where available > 0
  )
  select i.id, i.organization_id, i.event_id, i.name, i.description, i.price_amount, i.currency,
    i.quantity, i.max_per_order, i.sales_start, i.sales_end, i.active, i.sort_order, i.available,
    (
      i.available > 0
      and i.phase_order = o.phase_order
      and (i.sales_start is null or i.sales_start <= now())
      and (i.sales_end is null or i.sales_end > now())
    )
  from inventory i
  cross join open_phase o
  order by i.phase_order, i.sort_order;
$$;

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
  type_row public.ticket_types;
  requested integer;
  type_reserved bigint;
  event_reserved bigint;
  subtotal bigint := 0;
  fee bigint := 0;
  expiry timestamptz := now() + interval '10 minutes';
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) = 0 then
    raise exception 'EMPTY_SELECTION' using errcode = 'P0001';
  end if;
  if (
    select count(*) <> count(distinct selected_item->>'ticket_type_id')
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
  if not found then
    raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if event_row.require_document and nullif(trim(buyer_document), '') is null then
    raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001';
  end if;

  select * into org_row from public.organizations where id = event_row.organization_id;

  update public.ticket_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.orders o
  set status = 'expired'
  where o.event_id = target_event and o.status = 'pending' and o.expires_at <= now();

  select coalesce(sum(h.quantity), 0)
  into event_reserved
  from public.ticket_holds h
  where h.event_id = target_event
    and (
      h.status = 'consumed'
      or (h.status = 'active' and h.expires_at > now())
    );

  for selection in select value from jsonb_array_elements(selections) loop
    requested := (selection->>'quantity')::integer;
    select * into type_row
    from public.ticket_types
    where id = (selection->>'ticket_type_id')::uuid
      and event_id = target_event
      and active
      and publicly_available
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

    select coalesce(sum(h.quantity), 0)
    into type_reserved
    from public.ticket_holds h
    where h.ticket_type_id = type_row.id
      and (
        h.status = 'consumed'
        or (h.status = 'active' and h.expires_at > now())
      );

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
    if event_reserved > event_row.capacity then
      raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001';
    end if;
    subtotal := subtotal + type_row.price_amount * requested;
  end loop;

  if org_row.fee_payer = 'buyer' then
    fee := round(subtotal * org_row.service_fee_bps::numeric / 10000);
  end if;

  insert into public.customers(organization_id, first_name, last_name, email, phone, document)
  values (
    event_row.organization_id,
    trim(buyer_first_name),
    trim(buyer_last_name),
    lower(trim(buyer_email)),
    nullif(trim(buyer_phone), ''),
    nullif(trim(buyer_document), '')
  )
  on conflict (organization_id, lower(email)) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = coalesce(excluded.phone, public.customers.phone),
      document = coalesce(excluded.document, public.customers.document)
  returning id into customer_id;

  insert into public.orders(
    public_id, organization_id, event_id, customer_id,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id,
    subtotal, fee, subtotal + fee, event_row.currency, expiry
  ) returning id into order_id;

  for selection in select value from jsonb_array_elements(selections) loop
    requested := (selection->>'quantity')::integer;
    select * into type_row
    from public.ticket_types
    where id = (selection->>'ticket_type_id')::uuid;

    insert into public.order_items(
      organization_id, order_id, ticket_type_id, item_name,
      quantity, unit_price_amount, line_total_amount, currency
    ) values (
      event_row.organization_id, order_id, type_row.id, type_row.name,
      requested, type_row.price_amount, type_row.price_amount * requested, type_row.currency
    );
    insert into public.ticket_holds(
      organization_id, event_id, ticket_type_id, order_id, quantity, expires_at
    ) values (
      event_row.organization_id, target_event, type_row.id, order_id, requested, expiry
    );
  end loop;

  return query select generated_public_id, expiry;
end;
$$;

create function public.get_public_order(target_public_id text)
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
  select o.id into target_order_id
  from public.orders o
  where o.public_id = target_public_id
  for update;

  if not found then
    return;
  end if;

  update public.ticket_holds h
  set status = 'expired'
  where h.order_id = target_order_id and h.status = 'active' and h.expires_at <= now();
  update public.orders o
  set status = 'expired'
  where o.id = target_order_id and o.status = 'pending' and o.expires_at <= now();

  return query
  select o.public_id,
    e.name,
    e.slug,
    e.cover_image_url,
    o.status,
    o.subtotal_amount,
    o.service_fee_amount,
    o.total_amount,
    o.currency,
    o.expires_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', i.item_name,
          'quantity', i.quantity,
          'unit_price_amount', i.unit_price_amount
        ) order by i.created_at
      ),
      '[]'::jsonb
    ),
    latest_payment.public_id,
    latest_payment.status,
    coalesce(latest_payment.requires_action, false),
    latest_payment.updated_at,
    exists (
      select 1 from public.payment_accounts a
      where a.organization_id = o.organization_id
        and a.provider = 'mercado_pago'
        and a.status = 'connected'
    )
  from public.orders o
  join public.events e on e.id = o.event_id
  join public.order_items i on i.order_id = o.id
  left join lateral (
    select p.public_id, p.status, p.requires_action, p.updated_at
    from public.payments p
    where p.order_id = o.id
    order by p.created_at desc
    limit 1
  ) latest_payment on true
  where o.id = target_order_id
  group by o.id, e.name, e.slug, e.cover_image_url,
    latest_payment.public_id, latest_payment.status,
    latest_payment.requires_action, latest_payment.updated_at;
end;
$$;

create function public.get_dashboard_sales_metrics(target_organization uuid)
returns table (
  confirmed_orders bigint,
  confirmed_tickets bigint,
  pending_reservations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  select
    (select count(*) from public.orders o where o.organization_id = target_organization and o.status = 'paid'),
    (
      select coalesce(sum(i.quantity), 0)
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where o.organization_id = target_organization and o.status = 'paid'
    ),
    (
      select coalesce(sum(h.quantity), 0)
      from public.ticket_holds h
      where h.organization_id = target_organization
        and h.status = 'active'
        and h.expires_at > now()
    );
end;
$$;

revoke all on function public.get_payment_account_status(uuid) from public, anon, authenticated;
revoke all on function public.disconnect_payment_account(uuid) from public, anon, authenticated;
revoke all on function public.prepare_payment_attempt(text) from public, anon, authenticated;
revoke all on function public.set_payment_checkout(text, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_payment_checkout(text, text) from public, anon, authenticated;
revoke all on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.get_public_order(text) from public, anon, authenticated;
revoke all on function public.get_dashboard_sales_metrics(uuid) from public, anon, authenticated;

grant execute on function public.get_payment_account_status(uuid) to authenticated;
grant execute on function public.disconnect_payment_account(uuid) to authenticated;
grant execute on function public.prepare_payment_attempt(text) to service_role;
grant execute on function public.set_payment_checkout(text, text, text, text) to service_role;
grant execute on function public.fail_payment_checkout(text, text) to service_role;
grant execute on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) to service_role;
grant execute on function public.get_public_order(text) to anon, authenticated;
grant execute on function public.get_dashboard_sales_metrics(uuid) to authenticated;
