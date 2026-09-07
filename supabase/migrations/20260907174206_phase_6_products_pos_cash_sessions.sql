create type public.pos_device_status as enum ('pending', 'active', 'revoked');
create type public.pos_session_status as enum ('open', 'closed');
create type public.pos_cash_movement_type as enum ('sale', 'refund', 'cash_in', 'cash_out');
create type public.pos_payment_method as enum ('cash', 'card', 'mercado_pago', 'bank_transfer');

create type public.order_channel_v2 as enum ('ticket_web', 'admin', 'pos');
alter table public.orders alter column channel drop default;
alter table public.orders alter column channel type public.order_channel_v2
  using channel::text::public.order_channel_v2;
drop type public.order_channel;
alter type public.order_channel_v2 rename to order_channel;
alter table public.orders alter column channel set default 'ticket_web'::public.order_channel;

alter table public.order_items drop constraint order_items_typed_reference;
create type public.order_item_type_v2 as enum ('ticket', 'table', 'product');
alter table public.order_items alter column item_type drop default;
alter table public.order_items alter column item_type type public.order_item_type_v2
  using item_type::text::public.order_item_type_v2;
drop type public.order_item_type;
alter type public.order_item_type_v2 rename to order_item_type;
alter table public.order_items alter column item_type set default 'ticket'::public.order_item_type;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index product_categories_org_name_unique
  on public.product_categories (organization_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  sku text check (sku is null or char_length(trim(sku)) between 1 and 80),
  barcode text check (barcode is null or char_length(trim(barcode)) between 1 and 120),
  default_price_amount bigint check (default_price_amount is null or default_price_amount >= 0),
  currency char(3) not null default 'ARS',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (category_id, organization_id)
    references public.product_categories(id, organization_id) on delete restrict
);

create unique index products_org_sku_unique
  on public.products (organization_id, lower(sku)) where sku is not null;
create unique index products_org_barcode_unique
  on public.products (organization_id, barcode) where barcode is not null;
create index products_org_active_name_idx
  on public.products (organization_id, active, name);

create table public.event_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  product_id uuid not null,
  price_amount bigint not null check (price_amount >= 0),
  currency char(3) not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, product_id),
  unique (id, event_id, organization_id),
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete restrict
);

create index event_products_event_enabled_sort_idx
  on public.event_products (event_id, enabled, sort_order);
create index event_products_product_idx on public.event_products (product_id);

create table public.sales_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 400),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id, organization_id)
);

create unique index sales_locations_event_name_unique
  on public.sales_locations (event_id, lower(name));
create index sales_locations_event_active_sort_idx
  on public.sales_locations (event_id, active, sort_order);

create table public.sales_location_products (
  sales_location_id uuid not null,
  event_product_id uuid not null,
  organization_id uuid not null,
  event_id uuid not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sales_location_id, event_product_id),
  foreign key (sales_location_id, event_id, organization_id)
    references public.sales_locations(id, event_id, organization_id) on delete cascade,
  foreign key (event_product_id, event_id, organization_id)
    references public.event_products(id, event_id, organization_id) on delete cascade
);

create index sales_location_products_event_idx
  on public.sales_location_products (event_id, sales_location_id, enabled, sort_order);

create table public.pos_device_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  sales_location_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 80),
  status public.pos_device_status not null default 'pending',
  pin_hash text,
  code_expires_at timestamptz not null,
  session_expires_at timestamptz not null,
  activation_count integer not null default 0 check (activation_count between 0 and 1),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id, organization_id),
  unique (id, event_id, sales_location_id, organization_id),
  foreign key (sales_location_id, event_id, organization_id)
    references public.sales_locations(id, event_id, organization_id) on delete restrict,
  check (code_expires_at <= session_expires_at),
  check (
    (status = 'pending' and activation_count = 0 and activated_at is null and pin_hash is not null and revoked_at is null)
    or (status = 'active' and activation_count = 1 and activated_at is not null and pin_hash is null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and pin_hash is null)
  )
);

create index pos_device_authorizations_event_location_idx
  on public.pos_device_authorizations (event_id, sales_location_id, created_at desc);
create index pos_device_authorizations_pending_idx
  on public.pos_device_authorizations (code_expires_at)
  where status = 'pending';

create table public.pos_device_sessions (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.pos_device_authorizations(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  sales_location_id uuid not null,
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  sale_window_started_at timestamptz not null default now(),
  sale_attempts integer not null default 0 check (sale_attempts >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, event_id, sales_location_id, organization_id),
  foreign key (authorization_id, event_id, sales_location_id, organization_id)
    references public.pos_device_authorizations(id, event_id, sales_location_id, organization_id) on delete restrict
);

create index pos_device_sessions_authorization_idx on public.pos_device_sessions (authorization_id);
create index pos_device_sessions_event_active_idx
  on public.pos_device_sessions (event_id, sales_location_id, expires_at)
  where revoked_at is null;

create table public.pos_activation_rate_limits (
  fingerprint_hash text primary key check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  sales_location_id uuid not null,
  pos_device_id uuid not null,
  device_session_id uuid not null references public.pos_device_sessions(id) on delete restrict,
  status public.pos_session_status not null default 'open',
  operator_label text check (operator_label is null or char_length(trim(operator_label)) between 1 and 80),
  opening_cash_amount bigint not null default 0 check (opening_cash_amount >= 0),
  opened_at timestamptz not null default now(),
  closing_counted_cash_amount bigint check (closing_counted_cash_amount is null or closing_counted_cash_amount >= 0),
  closing_expected_cash_amount bigint check (closing_expected_cash_amount is null or closing_expected_cash_amount >= 0),
  closing_difference_amount bigint,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id, organization_id),
  unique (id, event_id, sales_location_id, organization_id),
  foreign key (pos_device_id, event_id, sales_location_id, organization_id)
    references public.pos_device_authorizations(id, event_id, sales_location_id, organization_id) on delete restrict,
  foreign key (sales_location_id, event_id, organization_id)
    references public.sales_locations(id, event_id, organization_id) on delete restrict,
  check (
    (status = 'open' and closed_at is null and closing_counted_cash_amount is null and closing_expected_cash_amount is null and closing_difference_amount is null)
    or (status = 'closed' and closed_at is not null and closing_counted_cash_amount is not null and closing_expected_cash_amount is not null and closing_difference_amount is not null)
  )
);

create unique index pos_sessions_device_open_unique
  on public.pos_sessions (pos_device_id) where status = 'open';
create index pos_sessions_event_location_opened_idx
  on public.pos_sessions (event_id, sales_location_id, opened_at desc);

alter table public.orders alter column customer_id drop not null;
alter table public.orders alter column expires_at drop not null;
alter table public.orders
  add column sales_location_id uuid,
  add column pos_session_id uuid,
  add column pos_idempotency_key uuid;
alter table public.orders
  add constraint orders_pos_context_check check (
    (channel = 'pos' and customer_id is null and promoter_id is null and event_promoter_id is null
      and sales_location_id is not null and pos_session_id is not null and pos_idempotency_key is not null)
    or (channel <> 'pos' and customer_id is not null and sales_location_id is null
      and pos_session_id is null and pos_idempotency_key is null)
  ),
  add constraint orders_pos_session_scope_fkey
    foreign key (pos_session_id, event_id, sales_location_id, organization_id)
    references public.pos_sessions(id, event_id, sales_location_id, organization_id) on delete restrict;
create unique index orders_pos_idempotency_unique
  on public.orders (pos_session_id, pos_idempotency_key) where channel = 'pos';
create index orders_channel_event_created_idx on public.orders (channel, event_id, created_at desc);

alter table public.order_items
  add column product_id uuid references public.products(id) on delete restrict,
  add column event_product_id uuid references public.event_products(id) on delete restrict;
alter table public.order_items add constraint order_items_typed_reference check (
  (item_type = 'ticket' and ticket_type_id is not null and event_table_id is null and product_id is null and event_product_id is null)
  or (item_type = 'table' and ticket_type_id is null and event_table_id is not null and product_id is null and event_product_id is null and quantity = 1)
  or (item_type = 'product' and ticket_type_id is null and event_table_id is null and product_id is not null and event_product_id is not null)
);
create index order_items_product_idx on public.order_items (product_id, created_at desc)
  where product_id is not null;
create index order_items_event_product_idx on public.order_items (event_product_id, created_at desc)
  where event_product_id is not null;

alter table public.payments alter column payment_account_id drop not null;
alter table public.payments add column method public.pos_payment_method;
alter table public.payments add column external_reference text check (external_reference is null or char_length(external_reference) <= 160);
alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('mercado_pago', 'manual'));
alter table public.payments add constraint payments_account_provider_check check (
  (provider = 'mercado_pago' and payment_account_id is not null)
  or (provider = 'manual' and payment_account_id is null and method is not null)
);
update public.payments set method = 'mercado_pago' where provider = 'mercado_pago' and method is null;
create index payments_method_created_idx on public.payments (organization_id, method, created_at desc);

create table public.pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  pos_session_id uuid not null,
  type public.pos_cash_movement_type not null,
  amount bigint not null check (amount > 0),
  order_id uuid references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  reason text check (reason is null or char_length(trim(reason)) between 2 and 240),
  created_at timestamptz not null default now(),
  foreign key (pos_session_id, event_id, organization_id)
    references public.pos_sessions(id, event_id, organization_id) on delete restrict,
  check (
    (type = 'sale' and order_id is not null and payment_id is not null and reason is null)
    or (type = 'refund' and order_id is not null and payment_id is not null)
    or (type in ('cash_in', 'cash_out') and order_id is null and payment_id is null and reason is not null)
  )
);

create index pos_cash_movements_session_created_idx
  on public.pos_cash_movements (pos_session_id, created_at);
create index pos_cash_movements_event_type_idx
  on public.pos_cash_movements (event_id, type, created_at desc);

create trigger product_categories_touch before update on public.product_categories
for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();
create trigger event_products_touch before update on public.event_products
for each row execute function public.touch_updated_at();
create trigger sales_locations_touch before update on public.sales_locations
for each row execute function public.touch_updated_at();
create trigger sales_location_products_touch before update on public.sales_location_products
for each row execute function public.touch_updated_at();
create trigger pos_device_authorizations_touch before update on public.pos_device_authorizations
for each row execute function public.touch_updated_at();
create trigger pos_sessions_touch before update on public.pos_sessions
for each row execute function public.touch_updated_at();

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.event_products enable row level security;
alter table public.sales_locations enable row level security;
alter table public.sales_location_products enable row level security;
alter table public.pos_device_authorizations enable row level security;
alter table public.pos_device_sessions enable row level security;
alter table public.pos_activation_rate_limits enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.pos_cash_movements enable row level security;

create policy product_categories_manager_all on public.product_categories for all to authenticated
using ((select public.can_manage_org(organization_id)))
with check ((select public.can_manage_org(organization_id)));
create policy products_manager_all on public.products for all to authenticated
using ((select public.can_manage_org(organization_id)))
with check ((select public.can_manage_org(organization_id)));
create policy event_products_manager_all on public.event_products for all to authenticated
using ((select public.can_manage_org(organization_id)))
with check ((select public.can_manage_org(organization_id)));
create policy sales_locations_manager_all on public.sales_locations for all to authenticated
using ((select public.can_manage_org(organization_id)))
with check ((select public.can_manage_org(organization_id)));
create policy sales_location_products_manager_all on public.sales_location_products for all to authenticated
using ((select public.can_manage_org(organization_id)))
with check ((select public.can_manage_org(organization_id)));
create policy pos_device_authorizations_manager_select on public.pos_device_authorizations for select to authenticated
using ((select public.can_manage_org(organization_id)));
create policy pos_device_sessions_manager_select on public.pos_device_sessions for select to authenticated
using ((select public.can_manage_org(organization_id)));
create policy pos_sessions_manager_select on public.pos_sessions for select to authenticated
using ((select public.can_manage_org(organization_id)));
create policy pos_cash_movements_manager_select on public.pos_cash_movements for select to authenticated
using ((select public.can_manage_org(organization_id)));

revoke all on table public.product_categories, public.products, public.event_products,
  public.sales_locations, public.sales_location_products, public.pos_device_authorizations,
  public.pos_device_sessions, public.pos_activation_rate_limits, public.pos_sessions,
  public.pos_cash_movements from anon, authenticated;
grant select, insert, update on table public.product_categories, public.products,
  public.event_products, public.sales_locations, public.sales_location_products to authenticated;
grant select (
  id, organization_id, event_id, sales_location_id, name, status, code_expires_at,
  session_expires_at, activation_count, activated_at, revoked_at, created_by, created_at, updated_at
) on public.pos_device_authorizations to authenticated;
grant select on table public.pos_device_sessions, public.pos_sessions, public.pos_cash_movements to authenticated;
grant select, insert, update, delete on table public.product_categories, public.products,
  public.event_products, public.sales_locations, public.sales_location_products,
  public.pos_device_authorizations, public.pos_device_sessions, public.pos_activation_rate_limits,
  public.pos_sessions, public.pos_cash_movements to service_role;

create or replace function public.audit_pos_configuration_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_org uuid;
  row_id uuid;
  verb text;
begin
  row_org := coalesce((to_jsonb(new)->>'organization_id')::uuid, (to_jsonb(old)->>'organization_id')::uuid);
  row_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
  verb := case when tg_op = 'INSERT' then 'created' when tg_op = 'DELETE' then 'deleted'
    when coalesce((to_jsonb(old)->>'active')::boolean, true) and not coalesce((to_jsonb(new)->>'active')::boolean, true) then 'disabled'
    else 'updated' end;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (row_org, auth.uid(), 'pos.' || tg_table_name || '.' || verb, tg_table_name, row_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;
revoke all on function public.audit_pos_configuration_change() from public, anon, authenticated;

create trigger product_categories_audit after insert or update or delete on public.product_categories
for each row execute function public.audit_pos_configuration_change();
create trigger products_audit after insert or update on public.products
for each row execute function public.audit_pos_configuration_change();
create trigger event_products_audit after insert or update on public.event_products
for each row execute function public.audit_pos_configuration_change();
create trigger sales_locations_audit after insert or update on public.sales_locations
for each row execute function public.audit_pos_configuration_change();

create trigger event_products_require_pos before insert on public.event_products
for each row execute function public.reject_disabled_event_module_insert('pos_enabled');
create trigger sales_locations_require_pos before insert on public.sales_locations
for each row execute function public.reject_disabled_event_module_insert('pos_enabled');
create trigger pos_devices_require_pos before insert on public.pos_device_authorizations
for each row execute function public.reject_disabled_event_module_insert('pos_enabled');
create trigger pos_sessions_require_pos before insert on public.pos_sessions
for each row execute function public.reject_disabled_event_module_insert('pos_enabled');

create or replace function public.create_pos_device_authorization(
  target_event uuid,
  target_location uuid,
  device_name text,
  target_pin text,
  target_code_expires_at timestamptz,
  target_session_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events;
  location_row public.sales_locations;
  created_id uuid;
begin
  select * into event_row from public.events where id = target_event for update;
  select * into location_row from public.sales_locations where id = target_location and event_id = target_event;
  if auth.uid() is null or not found or not public.can_manage_org(event_row.organization_id)
    or location_row.id is null or location_row.organization_id <> event_row.organization_id then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not event_row.pos_enabled then raise exception 'POS_DISABLED' using errcode = 'P0001'; end if;
  if event_row.status not in ('published', 'sold_out') then raise exception 'EVENT_NOT_OPERATIONAL' using errcode = 'P0001'; end if;
  if not location_row.active then raise exception 'LOCATION_DISABLED' using errcode = 'P0001'; end if;
  if char_length(trim(device_name)) < 2 or target_pin !~ '^[0-9]{6}$'
    or target_code_expires_at <= now() or target_session_expires_at <= target_code_expires_at then
    raise exception 'INVALID_DEVICE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pos_device_authorizations a
    where a.status = 'pending' and a.code_expires_at > now()
      and a.pin_hash = extensions.crypt(target_pin, a.pin_hash)) then
    raise exception 'PIN_COLLISION' using errcode = 'P0001';
  end if;
  insert into public.pos_device_authorizations (
    organization_id, event_id, sales_location_id, name, pin_hash,
    code_expires_at, session_expires_at, created_by
  ) values (
    event_row.organization_id, event_row.id, location_row.id, trim(device_name),
    extensions.crypt(target_pin, extensions.gen_salt('bf', 10)),
    target_code_expires_at, target_session_expires_at, auth.uid()
  ) returning id into created_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'pos_device.created', 'pos_device', created_id,
    jsonb_build_object('event_id', event_row.id, 'sales_location_id', location_row.id));
  return created_id;
end;
$$;

create or replace function public.revoke_pos_device(target_authorization uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare auth_row public.pos_device_authorizations;
begin
  select * into auth_row from public.pos_device_authorizations where id = target_authorization for update;
  if not found or auth.uid() is null or not public.can_manage_org(auth_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.pos_device_authorizations set status = 'revoked', revoked_at = coalesce(revoked_at, now()), pin_hash = null
  where id = auth_row.id;
  update public.pos_device_sessions set revoked_at = coalesce(revoked_at, now())
  where authorization_id = auth_row.id and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (auth_row.organization_id, auth.uid(), 'pos_device.revoked', 'pos_device', auth_row.id);
end;
$$;

create or replace function public.activate_pos_device(
  target_pin text,
  target_session_hash text,
  target_fingerprint_hash text
) returns table (
  activation_status text, device_session_id uuid, device_id uuid, event_id uuid, event_name text,
  sales_location_id uuid, sales_location_name text, device_name text,
  event_timezone text, expires_at timestamptz, retry_after_seconds integer
) language plpgsql security definer set search_path = '' as $$
declare
  rate_row public.pos_activation_rate_limits;
  auth_row public.pos_device_authorizations;
  selected_event public.events;
  selected_location public.sales_locations;
  selected_venue public.venues;
  created_session uuid;
  next_attempts integer;
  blocked_until_value timestamptz;
begin
  if target_pin !~ '^[0-9]{6}$' or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text,
      null::text, null::text, null::timestamptz, 0;
    return;
  end if;
  delete from public.pos_activation_rate_limits where updated_at < now() - interval '24 hours';
  insert into public.pos_activation_rate_limits (fingerprint_hash) values (target_fingerprint_hash)
  on conflict (fingerprint_hash) do nothing;
  select * into rate_row from public.pos_activation_rate_limits where fingerprint_hash = target_fingerprint_hash for update;
  if rate_row.blocked_until is not null and rate_row.blocked_until > now() then
    return query select 'rate_limited', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text,
      null::text, null::text, null::timestamptz,
      greatest(1, ceil(extract(epoch from (rate_row.blocked_until - now())))::integer);
    return;
  end if;
  if rate_row.window_started_at <= now() - interval '15 minutes' then
    update public.pos_activation_rate_limits set window_started_at = now(), failed_attempts = 0,
      blocked_until = null, updated_at = now() where fingerprint_hash = target_fingerprint_hash returning * into rate_row;
  end if;
  select * into auth_row from public.pos_device_authorizations a
  where a.status = 'pending' and a.pin_hash is not null and a.code_expires_at > now()
    and a.pin_hash = extensions.crypt(target_pin, a.pin_hash)
  order by a.created_at desc limit 1 for update;
  if not found then
    next_attempts := rate_row.failed_attempts + 1;
    blocked_until_value := case when next_attempts >= 5 then now() + interval '15 minutes' else null end;
    update public.pos_activation_rate_limits set failed_attempts = next_attempts,
      blocked_until = blocked_until_value, updated_at = now() where fingerprint_hash = target_fingerprint_hash;
    return query select case when blocked_until_value is null then 'invalid' else 'rate_limited' end,
      null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text, null::text, null::text,
      null::timestamptz, case when blocked_until_value is null then 0 else 900 end;
    return;
  end if;
  select * into selected_event from public.events where id = auth_row.event_id;
  select * into selected_location from public.sales_locations where id = auth_row.sales_location_id;
  select * into selected_venue from public.venues where id = selected_event.venue_id;
  if auth_row.session_expires_at <= now() or not selected_event.pos_enabled
    or selected_event.status not in ('published', 'sold_out') or not selected_location.active then
    update public.pos_device_authorizations set status = 'revoked', revoked_at = now(), pin_hash = null where id = auth_row.id;
    return query select 'expired', null::uuid, null::uuid, null::uuid, null::text, null::uuid, null::text,
      null::text, null::text, null::timestamptz, 0;
    return;
  end if;
  insert into public.pos_device_sessions (
    authorization_id, organization_id, event_id, sales_location_id, session_token_hash, expires_at
  ) values (
    auth_row.id, auth_row.organization_id, auth_row.event_id, auth_row.sales_location_id,
    target_session_hash, auth_row.session_expires_at
  ) returning id into created_session;
  update public.pos_device_authorizations set status = 'active', activation_count = 1,
    activated_at = now(), pin_hash = null where id = auth_row.id;
  update public.pos_activation_rate_limits set failed_attempts = 0, blocked_until = null,
    window_started_at = now(), updated_at = now() where fingerprint_hash = target_fingerprint_hash;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (auth_row.organization_id, 'pos_device.activated', 'pos_device_session', created_session,
    jsonb_build_object('device_id', auth_row.id, 'sales_location_id', auth_row.sales_location_id));
  return query select 'ok', created_session, auth_row.id, selected_event.id, selected_event.name,
    selected_location.id, selected_location.name, auth_row.name, selected_venue.timezone,
    auth_row.session_expires_at, 0;
end;
$$;

create or replace function public.get_pos_device_session(target_session_hash text)
returns table (
  device_session_id uuid, device_id uuid, event_id uuid, event_name text,
  sales_location_id uuid, sales_location_name text, device_name text,
  event_timezone text, expires_at timestamptz, pos_enabled boolean,
  event_status public.event_status, cash_session_id uuid, cash_session_status public.pos_session_status,
  operator_label text, opening_cash_amount bigint, opened_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare session_row public.pos_device_sessions; auth_row public.pos_device_authorizations;
declare event_row public.events; location_row public.sales_locations; venue_row public.venues;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.pos_device_sessions where session_token_hash = target_session_hash for update;
  if not found then return; end if;
  select * into auth_row from public.pos_device_authorizations where id = session_row.authorization_id;
  select * into event_row from public.events where id = session_row.event_id;
  select * into location_row from public.sales_locations where id = session_row.sales_location_id;
  select * into venue_row from public.venues where id = event_row.venue_id;
  if session_row.revoked_at is not null or session_row.expires_at <= now()
    or auth_row.status <> 'active' or not location_row.active then return; end if;
  update public.pos_device_sessions set last_seen_at = now() where id = session_row.id;
  return query
  select session_row.id, auth_row.id, event_row.id, event_row.name, location_row.id,
    location_row.name, auth_row.name, venue_row.timezone, session_row.expires_at,
    event_row.pos_enabled, event_row.status, ps.id, ps.status, ps.operator_label,
    ps.opening_cash_amount, ps.opened_at
  from (select 1) x
  left join lateral (
    select p.* from public.pos_sessions p where p.pos_device_id = auth_row.id
    order by p.opened_at desc limit 1
  ) ps on true;
end;
$$;

create or replace function public.get_pos_catalog(target_session_hash text)
returns table (
  event_product_id uuid, product_id uuid, product_name text, product_description text,
  category_id uuid, category_name text, sku text, barcode text,
  price_amount bigint, currency char(3), sort_order integer
) language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select ep.id, p.id, p.name, p.description, c.id, c.name, p.sku, p.barcode,
    ep.price_amount, ep.currency, slp.sort_order
  from public.pos_device_sessions ds
  join public.pos_device_authorizations da on da.id = ds.authorization_id and da.status = 'active'
  join public.events e on e.id = ds.event_id and e.pos_enabled and e.status in ('published', 'sold_out')
  join public.sales_locations sl on sl.id = ds.sales_location_id and sl.active
  join public.sales_location_products slp on slp.sales_location_id = sl.id and slp.enabled
  join public.event_products ep on ep.id = slp.event_product_id and ep.event_id = e.id and ep.enabled
  join public.products p on p.id = ep.product_id
  left join public.product_categories c on c.id = p.category_id
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now()
  order by coalesce(c.sort_order, 999), slp.sort_order, p.name;
end;
$$;

create or replace function public.open_pos_session(
  target_session_hash text,
  target_opening_cash_amount bigint,
  target_operator_label text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare device_session public.pos_device_sessions; auth_row public.pos_device_authorizations;
declare event_row public.events; created_id uuid;
begin
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now() for update;
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into auth_row from public.pos_device_authorizations where id = device_session.authorization_id for update;
  select * into event_row from public.events where id = device_session.event_id for update;
  if auth_row.status <> 'active' or not event_row.pos_enabled
    or event_row.status not in ('published', 'sold_out') then
    raise exception 'POS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  if target_opening_cash_amount < 0 or char_length(coalesce(trim(target_operator_label), '')) > 80 then
    raise exception 'INVALID_OPENING' using errcode = 'P0001';
  end if;
  insert into public.pos_sessions (
    organization_id, event_id, sales_location_id, pos_device_id, device_session_id,
    operator_label, opening_cash_amount
  ) values (
    device_session.organization_id, device_session.event_id, device_session.sales_location_id,
    auth_row.id, device_session.id, nullif(trim(target_operator_label), ''), target_opening_cash_amount
  ) returning id into created_id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (device_session.organization_id, 'pos_session.opened', 'pos_session', created_id,
    jsonb_build_object('device_id', auth_row.id, 'opening_cash_amount', target_opening_cash_amount));
  return created_id;
exception when unique_violation then
  raise exception 'SESSION_ALREADY_OPEN' using errcode = 'P0001';
end;
$$;

create or replace function public.finalize_pos_sale(
  target_session_hash text,
  target_idempotency_key uuid,
  target_items jsonb,
  target_payment_method public.pos_payment_method,
  target_cash_received_amount bigint default null,
  target_external_reference text default null
) returns table (
  order_id uuid, order_public_id text, sale_code text, total_amount bigint,
  currency char(3), payment_method public.pos_payment_method,
  cash_received_amount bigint, change_amount bigint, reused boolean, created_at timestamptz
) language plpgsql security definer set search_path = '' as $$
declare
  device_session public.pos_device_sessions;
  cash_session public.pos_sessions;
  event_row public.events;
  item jsonb;
  product_row record;
  requested integer;
  subtotal bigint := 0;
  order_uuid uuid;
  payment_uuid uuid;
  public_code text;
  sale_created_at timestamptz;
  resolved_currency char(3);
  received bigint;
  change_value bigint;
  existing_total bigint;
  existing_currency char(3);
  existing_method public.pos_payment_method;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_idempotency_key::text, 0));
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now() for update;
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open' for update;
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = device_session.event_id for update;
  if not event_row.pos_enabled or event_row.status not in ('published', 'sold_out') then
    raise exception 'POS_NOT_OPERATIONAL' using errcode = 'P0001';
  end if;
  select o.id, o.public_id, o.total_amount, o.currency, o.created_at,
    p.id, p.method into order_uuid, public_code, existing_total, existing_currency, sale_created_at,
    payment_uuid, existing_method
  from public.orders o join public.payments p on p.order_id = o.id
  where o.pos_session_id = cash_session.id and o.pos_idempotency_key = target_idempotency_key;
  if found then
    return query select order_uuid, public_code, upper(substr(public_code, 1, 4)), existing_total,
      existing_currency, existing_method, target_cash_received_amount,
      case when existing_method = 'cash' then greatest(coalesce(target_cash_received_amount, existing_total) - existing_total, 0) else 0 end,
      true, sale_created_at;
    return;
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) = 0
    or jsonb_array_length(target_items) > 60 then
    raise exception 'INVALID_ITEMS' using errcode = 'P0001';
  end if;
  for item in select value from jsonb_array_elements(target_items) loop
    requested := (item->>'quantity')::integer;
    if requested < 1 or requested > 99 then raise exception 'INVALID_QUANTITY' using errcode = 'P0001'; end if;
    select ep.id as event_product_id, ep.product_id, ep.price_amount, ep.currency,
      p.name into product_row
    from public.event_products ep
    join public.products p on p.id = ep.product_id
    join public.sales_location_products slp on slp.event_product_id = ep.id
      and slp.sales_location_id = device_session.sales_location_id and slp.enabled
    where ep.id = (item->>'event_product_id')::uuid and ep.event_id = device_session.event_id and ep.enabled
    for share of ep, p, slp;
    if not found then raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001'; end if;
    if resolved_currency is null then resolved_currency := product_row.currency;
    elsif resolved_currency <> product_row.currency then raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001'; end if;
    subtotal := subtotal + product_row.price_amount * requested;
  end loop;
  if target_payment_method = 'cash' then
    received := coalesce(target_cash_received_amount, 0);
    if received < subtotal then raise exception 'INSUFFICIENT_CASH' using errcode = 'P0001'; end if;
    change_value := received - subtotal;
  else
    received := null; change_value := 0;
  end if;
  insert into public.orders as created_order (
    organization_id, event_id, customer_id, channel, status, subtotal_amount,
    service_fee_amount, total_amount, currency, expires_at, sales_location_id,
    pos_session_id, pos_idempotency_key
  ) values (
    device_session.organization_id, device_session.event_id, null, 'pos', 'paid', subtotal,
    0, subtotal, resolved_currency, null, device_session.sales_location_id,
    cash_session.id, target_idempotency_key
  ) returning created_order.id, created_order.public_id, created_order.created_at
    into order_uuid, public_code, sale_created_at;
  for item in select value from jsonb_array_elements(target_items) loop
    requested := (item->>'quantity')::integer;
    select ep.id as event_product_id, ep.product_id, ep.price_amount, ep.currency,
      p.name into product_row
    from public.event_products ep join public.products p on p.id = ep.product_id
    where ep.id = (item->>'event_product_id')::uuid;
    insert into public.order_items (
      organization_id, order_id, item_type, product_id, event_product_id, item_name,
      quantity, unit_price_amount, line_total_amount, currency
    ) values (
      device_session.organization_id, order_uuid, 'product', product_row.product_id,
      product_row.event_product_id, product_row.name, requested, product_row.price_amount,
      product_row.price_amount * requested, product_row.currency
    );
  end loop;
  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, idempotency_key,
    attempt_number, status, currency, gross_amount, service_fee_amount,
    platform_fee_amount, processor_fee_amount, seller_net_amount, method,
    external_reference, approved_at
  ) values (
    device_session.organization_id, order_uuid, null, 'manual', target_idempotency_key,
    1, 'approved', resolved_currency, subtotal, 0, 0, 0, subtotal,
    target_payment_method, nullif(trim(target_external_reference), ''), now()
  ) returning id into payment_uuid;
  if target_payment_method = 'cash' and subtotal > 0 then
    insert into public.pos_cash_movements (
      organization_id, event_id, pos_session_id, type, amount, order_id, payment_id
    ) values (
      device_session.organization_id, device_session.event_id, cash_session.id,
      'sale', subtotal, order_uuid, payment_uuid
    );
  end if;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (device_session.organization_id, 'pos.sale.completed', 'order', order_uuid,
    jsonb_build_object('event_id', device_session.event_id, 'location_id', device_session.sales_location_id,
      'session_id', cash_session.id, 'amount', subtotal, 'payment_method', target_payment_method));
  return query select order_uuid, public_code, upper(substr(public_code, 1, 4)), subtotal,
    resolved_currency, target_payment_method, received, change_value, false, sale_created_at;
end;
$$;

create or replace function public.add_pos_cash_movement(
  target_session_hash text,
  target_type public.pos_cash_movement_type,
  target_amount bigint,
  target_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare device_session public.pos_device_sessions; cash_session public.pos_sessions; created_id uuid;
begin
  if target_type not in ('cash_in', 'cash_out') or target_amount <= 0 or char_length(trim(target_reason)) < 2 then
    raise exception 'INVALID_MOVEMENT' using errcode = 'P0001';
  end if;
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open' for update;
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.pos_cash_movements (organization_id, event_id, pos_session_id, type, amount, reason)
  values (device_session.organization_id, device_session.event_id, cash_session.id,
    target_type, target_amount, trim(target_reason)) returning id into created_id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (device_session.organization_id, 'pos.' || target_type::text, 'pos_cash_movement', created_id,
    jsonb_build_object('session_id', cash_session.id, 'amount', target_amount, 'reason', trim(target_reason)));
  return created_id;
end;
$$;

create or replace function public.get_pos_cash_summary(target_session_hash text)
returns table (
  pos_session_id uuid, opening_cash_amount bigint, cash_sales_amount bigint,
  cash_in_amount bigint, cash_out_amount bigint, cash_refunds_amount bigint,
  expected_cash_amount bigint, sale_count bigint, total_sales_amount bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select ps.id, ps.opening_cash_amount,
    movements.cash_sales_amount,
    movements.cash_in_amount,
    movements.cash_out_amount,
    movements.cash_refunds_amount,
    (ps.opening_cash_amount + movements.cash_sales_amount + movements.cash_in_amount
      - movements.cash_refunds_amount - movements.cash_out_amount)::bigint,
    sales.sale_count,
    sales.total_sales_amount
  from public.pos_device_sessions ds
  join public.pos_sessions ps on ps.pos_device_id = ds.authorization_id and ps.status = 'open'
  cross join lateral (
    select
      coalesce(sum(m.amount) filter (where m.type = 'sale'), 0)::bigint as cash_sales_amount,
      coalesce(sum(m.amount) filter (where m.type = 'cash_in'), 0)::bigint as cash_in_amount,
      coalesce(sum(m.amount) filter (where m.type = 'cash_out'), 0)::bigint as cash_out_amount,
      coalesce(sum(m.amount) filter (where m.type = 'refund'), 0)::bigint as cash_refunds_amount
    from public.pos_cash_movements m where m.pos_session_id = ps.id
  ) movements
  cross join lateral (
    select count(*)::bigint as sale_count, coalesce(sum(o.total_amount), 0)::bigint as total_sales_amount
    from public.orders o where o.pos_session_id = ps.id and o.status = 'paid'
  ) sales
  where ds.session_token_hash = target_session_hash and ds.revoked_at is null and ds.expires_at > now()
  ;
end;
$$;

create or replace function public.close_pos_session(
  target_session_hash text,
  target_counted_cash_amount bigint
) returns table (pos_session_id uuid, expected_cash_amount bigint, counted_cash_amount bigint, difference_amount bigint, closed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare device_session public.pos_device_sessions; cash_session public.pos_sessions;
declare expected bigint; closed_time timestamptz := now();
begin
  if target_counted_cash_amount < 0 then raise exception 'INVALID_COUNT' using errcode = 'P0001'; end if;
  select * into device_session from public.pos_device_sessions
  where session_token_hash = target_session_hash and revoked_at is null and expires_at > now();
  if not found then raise exception 'DEVICE_NOT_AUTHORIZED' using errcode = 'P0001'; end if;
  select * into cash_session from public.pos_sessions
  where pos_device_id = device_session.authorization_id and status = 'open' for update;
  if not found then raise exception 'CASH_SESSION_REQUIRED' using errcode = 'P0001'; end if;
  select cash_session.opening_cash_amount
    + coalesce(sum(movement.amount) filter (where movement.type in ('sale', 'cash_in')), 0)
    - coalesce(sum(movement.amount) filter (where movement.type in ('refund', 'cash_out')), 0)
  into expected from public.pos_cash_movements movement
  where movement.pos_session_id = cash_session.id;
  update public.pos_sessions set status = 'closed', closing_counted_cash_amount = target_counted_cash_amount,
    closing_expected_cash_amount = expected, closing_difference_amount = target_counted_cash_amount - expected,
    closed_at = closed_time where id = cash_session.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (cash_session.organization_id, 'pos_session.closed', 'pos_session', cash_session.id,
    jsonb_build_object('expected_cash_amount', expected, 'counted_cash_amount', target_counted_cash_amount,
      'difference_amount', target_counted_cash_amount - expected));
  return query select cash_session.id, expected, target_counted_cash_amount,
    target_counted_cash_amount - expected, closed_time;
end;
$$;

create or replace function public.revoke_current_pos_device_session(target_session_hash text)
returns void language sql security definer set search_path = '' as $$
  update public.pos_device_sessions set revoked_at = coalesce(revoked_at, now())
  where session_token_hash = target_session_hash;
$$;

create or replace function public.get_event_pos_overview(target_event uuid)
returns table (
  total_revenue bigint, sale_count bigint, cash_revenue bigint, card_revenue bigint,
  mercado_pago_revenue bigint, bank_transfer_revenue bigint, open_sessions bigint,
  currency char(3)
) language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query select
    coalesce(sum(o.total_amount), 0)::bigint, count(o.id)::bigint,
    coalesce(sum(o.total_amount) filter (where p.method = 'cash'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where p.method = 'card'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where p.method = 'mercado_pago'), 0)::bigint,
    coalesce(sum(o.total_amount) filter (where p.method = 'bank_transfer'), 0)::bigint,
    (select count(*) from public.pos_sessions ps where ps.event_id = target_event and ps.status = 'open')::bigint,
    event_row.currency
  from public.orders o join public.payments p on p.order_id = o.id
  where o.event_id = target_event and o.channel = 'pos' and o.status = 'paid';
end;
$$;

create or replace function public.get_event_pos_location_metrics(target_event uuid)
returns table (sales_location_id uuid, location_name text, revenue bigint, sale_count bigint, device_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query select sl.id, sl.name, coalesce(sum(o.total_amount), 0)::bigint,
    count(distinct o.id)::bigint, count(distinct d.id)::bigint
  from public.sales_locations sl
  left join public.orders o on o.sales_location_id = sl.id and o.channel = 'pos' and o.status = 'paid'
  left join public.pos_device_authorizations d on d.sales_location_id = sl.id and d.status <> 'revoked'
  where sl.event_id = target_event group by sl.id order by sl.sort_order, sl.name;
end;
$$;

create or replace function public.get_event_pos_product_metrics(target_event uuid)
returns table (product_id uuid, product_name text, quantity_sold bigint, revenue bigint)
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query select oi.product_id, oi.item_name, sum(oi.quantity)::bigint,
    sum(oi.line_total_amount)::bigint
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.event_id = target_event and o.channel = 'pos' and o.status = 'paid' and oi.item_type = 'product'
  group by oi.product_id, oi.item_name order by sum(oi.quantity) desc, oi.item_name;
end;
$$;

create or replace function public.update_event_configuration(
  target_event uuid, target_profile public.event_profile,
  target_tickets_enabled boolean, target_promoters_enabled boolean,
  target_tables_enabled boolean, target_access_enabled boolean,
  target_pos_enabled boolean, target_inventory_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if event_row.pos_enabled and not target_pos_enabled and exists (
    select 1 from public.pos_sessions where event_id = target_event and status = 'open'
  ) then raise exception 'OPEN_POS_SESSIONS' using errcode = 'P0001'; end if;
  update public.events set profile = target_profile, tickets_enabled = target_tickets_enabled,
    promoters_enabled = target_promoters_enabled, tables_enabled = target_tables_enabled,
    access_enabled = target_access_enabled, pos_enabled = target_pos_enabled,
    inventory_enabled = target_inventory_enabled where id = target_event;
  if event_row.profile is distinct from target_profile then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (event_row.organization_id, auth.uid(), 'event.profile.updated', 'event', target_event,
      jsonb_build_object('profile', event_row.profile), jsonb_build_object('profile', target_profile));
  end if;
  if event_row.tickets_enabled is distinct from target_tickets_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tickets_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'tickets'));
  end if;
  if event_row.promoters_enabled is distinct from target_promoters_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_promoters_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'promoters'));
  end if;
  if event_row.tables_enabled is distinct from target_tables_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tables_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'tables'));
  end if;
  if event_row.access_enabled is distinct from target_access_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_access_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'access'));
  end if;
  if event_row.pos_enabled is distinct from target_pos_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_pos_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'pos'));
  end if;
  if event_row.inventory_enabled is distinct from target_inventory_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_inventory_enabled then 'event.capability.enabled' else 'event.capability.disabled' end, 'event', target_event, jsonb_build_object('capability', 'inventory'));
  end if;
end;
$$;

create function public.duplicate_event_with_options(
  target_event uuid, target_name text, target_slug text, target_starts_at timestamptz,
  preserve_tickets boolean, preserve_promoters boolean, preserve_tables boolean,
  preserve_products boolean, preserve_sales_locations boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source_event public.events; new_event_id uuid;
begin
  select * into source_event from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(source_event.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  new_event_id := public.duplicate_event_with_options(
    target_event, target_name, target_slug, target_starts_at,
    preserve_tickets, preserve_promoters, preserve_tables
  );
  if preserve_products and source_event.pos_enabled then
    insert into public.event_products (
      organization_id, event_id, product_id, price_amount, currency, enabled, sort_order
    )
    select organization_id, new_event_id, product_id, price_amount, currency, enabled, sort_order
    from public.event_products where event_id = target_event;
  end if;
  if preserve_sales_locations and source_event.pos_enabled then
    insert into public.sales_locations (
      organization_id, event_id, name, description, active, sort_order
    )
    select organization_id, new_event_id, name, description, active, sort_order
    from public.sales_locations where event_id = target_event;
    if preserve_products then
      insert into public.sales_location_products (
        sales_location_id, event_product_id, organization_id, event_id, enabled, sort_order
      )
      select new_location.id, new_product.id, source_assignment.organization_id,
        new_event_id, source_assignment.enabled, source_assignment.sort_order
      from public.sales_location_products source_assignment
      join public.sales_locations source_location on source_location.id = source_assignment.sales_location_id
      join public.event_products source_product on source_product.id = source_assignment.event_product_id
      join public.sales_locations new_location on new_location.event_id = new_event_id
        and lower(new_location.name) = lower(source_location.name)
      join public.event_products new_product on new_product.event_id = new_event_id
        and new_product.product_id = source_product.product_id
      where source_assignment.event_id = target_event;
    end if;
  end if;
  return new_event_id;
end;
$$;

revoke all on function public.create_pos_device_authorization(uuid, uuid, text, text, timestamptz, timestamptz),
  public.revoke_pos_device(uuid), public.activate_pos_device(text, text, text),
  public.get_pos_device_session(text), public.get_pos_catalog(text),
  public.open_pos_session(text, bigint, text),
  public.finalize_pos_sale(text, uuid, jsonb, public.pos_payment_method, bigint, text),
  public.add_pos_cash_movement(text, public.pos_cash_movement_type, bigint, text),
  public.get_pos_cash_summary(text), public.close_pos_session(text, bigint),
  public.revoke_current_pos_device_session(text), public.get_event_pos_overview(uuid),
  public.get_event_pos_location_metrics(uuid), public.get_event_pos_product_metrics(uuid)
from public, anon, authenticated;

revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean)
from public, anon, authenticated;

grant execute on function public.create_pos_device_authorization(uuid, uuid, text, text, timestamptz, timestamptz),
  public.revoke_pos_device(uuid), public.get_event_pos_overview(uuid),
  public.get_event_pos_location_metrics(uuid), public.get_event_pos_product_metrics(uuid)
to authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean)
to authenticated;
grant execute on function public.activate_pos_device(text, text, text), public.get_pos_device_session(text),
  public.get_pos_catalog(text), public.open_pos_session(text, bigint, text),
  public.finalize_pos_sale(text, uuid, jsonb, public.pos_payment_method, bigint, text),
  public.add_pos_cash_movement(text, public.pos_cash_movement_type, bigint, text),
  public.get_pos_cash_summary(text), public.close_pos_session(text, bigint),
  public.revoke_current_pos_device_session(text)
to service_role;

comment on column public.products.default_price_amount is 'Optional reusable catalog price in minor units. EventProduct is authoritative during a sale.';
comment on column public.orders.pos_idempotency_key is 'Client-generated UUID, unique inside a POS session.';
comment on column public.payments.method is 'Customer-facing payment method. POS V1 records manual external confirmation only.';
