create type public.order_item_type as enum ('ticket', 'table');
create type public.table_hold_status as enum ('active', 'consumed', 'expired', 'cancelled', 'refund_review');
create type public.entitlement_type as enum ('access', 'product', 'drink', 'generic');
create type public.entitlement_status as enum ('active', 'partially_redeemed', 'redeemed', 'revoked');
create type public.commission_subject_type as enum ('ticket', 'table');

alter table public.organizations
  add column table_service_fee_bps integer
  check (table_service_fee_bps is null or table_service_fee_bps between 0 and 10000);

create table public.table_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index table_zones_event_name_unique
  on public.table_zones (event_id, lower(name));
create index table_zones_organization_event_idx
  on public.table_zones (organization_id, event_id, sort_order);

create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  table_zone_id uuid not null references public.table_zones(id) on delete restrict,
  access_gate_id uuid references public.access_gates(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  capacity integer not null check (capacity between 1 and 500),
  base_price_amount bigint not null check (base_price_amount >= 0),
  currency char(3) not null default 'ARS',
  service_fee_bps integer check (service_fee_bps is null or service_fee_bps between 0 and 10000),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index event_tables_event_name_unique
  on public.event_tables (event_id, lower(name));
create index event_tables_organization_event_idx
  on public.event_tables (organization_id, event_id, table_zone_id, sort_order);
create index event_tables_access_gate_idx
  on public.event_tables (access_gate_id) where access_gate_id is not null;

create table public.table_entitlement_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_table_id uuid not null references public.event_tables(id) on delete cascade,
  entitlement_type public.entitlement_type not null,
  reference_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  quantity integer not null check (quantity between 1 and 10000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (entitlement_type <> 'access')
);

create index table_entitlement_templates_table_idx
  on public.table_entitlement_templates (event_table_id, sort_order);

create table public.table_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  event_table_id uuid not null references public.event_tables(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.table_hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index table_holds_occupying_table_unique
  on public.table_holds (event_table_id)
  where status in ('active', 'consumed', 'refund_review');
create index table_holds_event_active_idx
  on public.table_holds (event_id, expires_at)
  where status = 'active';
create index table_holds_order_idx on public.table_holds (order_id);

alter table public.order_items
  alter column ticket_type_id drop not null,
  add column item_type public.order_item_type not null default 'ticket',
  add column event_table_id uuid references public.event_tables(id) on delete restrict,
  add constraint order_items_typed_reference check (
    (item_type = 'ticket' and ticket_type_id is not null and event_table_id is null)
    or (item_type = 'table' and ticket_type_id is null and event_table_id is not null and quantity = 1)
  );

create index order_items_event_table_idx
  on public.order_items (event_table_id) where event_table_id is not null;

alter table public.tickets
  alter column ticket_type_id drop not null,
  add column event_table_id uuid references public.event_tables(id) on delete restrict,
  add constraint tickets_typed_reference check (
    (ticket_type_id is not null and event_table_id is null)
    or (ticket_type_id is null and event_table_id is not null and unit_index = 1)
  );

create unique index tickets_event_table_unique
  on public.tickets (event_table_id) where event_table_id is not null;

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  event_table_id uuid not null references public.event_tables(id) on delete restrict,
  template_id uuid references public.table_entitlement_templates(id) on delete set null,
  entitlement_type public.entitlement_type not null,
  reference_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  quantity integer not null check (quantity between 1 and 10000),
  redeemed_quantity integer not null default 0 check (redeemed_quantity >= 0 and redeemed_quantity <= quantity),
  status public.entitlement_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'revoked' and revoked_at is not null) or status <> 'revoked')
);

create unique index entitlements_order_item_template_unique
  on public.entitlements (order_item_id, template_id) where template_id is not null;
create unique index entitlements_order_item_access_unique
  on public.entitlements (order_item_id) where entitlement_type = 'access';
create index entitlements_event_table_idx on public.entitlements (event_table_id, status);
create index entitlements_order_idx on public.entitlements (order_id);

drop index public.promoter_commission_rules_general_active_unique;
drop index public.promoter_commission_rules_ticket_active_unique;

alter table public.promoter_commission_rules
  add column subject_type public.commission_subject_type not null default 'ticket',
  add column event_table_id uuid references public.event_tables(id) on delete cascade,
  add constraint promoter_commission_rules_typed_subject check (
    (subject_type = 'ticket' and event_table_id is null)
    or (subject_type = 'table' and ticket_type_id is null)
  );

create unique index promoter_commission_rules_default_subject_active_unique
  on public.promoter_commission_rules (event_promoter_id, subject_type)
  where ticket_type_id is null and event_table_id is null and active;
create unique index promoter_commission_rules_ticket_active_unique
  on public.promoter_commission_rules (event_promoter_id, ticket_type_id)
  where subject_type = 'ticket' and ticket_type_id is not null and active;
create unique index promoter_commission_rules_table_active_unique
  on public.promoter_commission_rules (event_promoter_id, event_table_id)
  where subject_type = 'table' and event_table_id is not null and active;
create index promoter_commission_rules_event_table_idx
  on public.promoter_commission_rules (event_table_id) where event_table_id is not null;

alter table public.promoter_commissions
  add column subject_type public.commission_subject_type not null default 'ticket',
  add column event_table_id uuid references public.event_tables(id) on delete set null;

create trigger table_zones_touch before update on public.table_zones
for each row execute function public.touch_updated_at();
create trigger event_tables_touch before update on public.event_tables
for each row execute function public.touch_updated_at();
create trigger table_entitlement_templates_touch before update on public.table_entitlement_templates
for each row execute function public.touch_updated_at();
create trigger table_holds_touch before update on public.table_holds
for each row execute function public.touch_updated_at();
create trigger entitlements_touch before update on public.entitlements
for each row execute function public.touch_updated_at();

alter table public.table_zones enable row level security;
alter table public.event_tables enable row level security;
alter table public.table_entitlement_templates enable row level security;
alter table public.table_holds enable row level security;
alter table public.entitlements enable row level security;

create policy table_zones_manager_select on public.table_zones
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy event_tables_manager_select on public.event_tables
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy table_entitlement_templates_manager_select on public.table_entitlement_templates
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy table_holds_manager_select on public.table_holds
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy entitlements_manager_select on public.entitlements
for select to authenticated using ((select public.can_manage_org(organization_id)));

grant select on public.table_zones, public.event_tables,
  public.table_entitlement_templates, public.table_holds, public.entitlements to authenticated;
grant all on public.table_zones, public.event_tables,
  public.table_entitlement_templates, public.table_holds, public.entitlements to service_role;

create function public.create_table_zone(
  target_event uuid,
  target_name text,
  target_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  new_zone_id uuid;
  next_sort_order integer;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 100
    or char_length(coalesce(target_description, '')) > 500 then
    raise exception 'INVALID_TABLE_ZONE' using errcode = 'P0001';
  end if;
  select coalesce(max(z.sort_order), -1) + 1 into next_sort_order
  from public.table_zones z where z.event_id = target_event;
  insert into public.table_zones (
    organization_id, event_id, name, description, sort_order
  ) values (
    event_row.organization_id, event_row.id, trim(target_name),
    trim(coalesce(target_description, '')), next_sort_order
  ) returning id into new_zone_id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_row.organization_id, auth.uid(), 'table_zone.created', 'table_zone', new_zone_id,
    jsonb_build_object('event_id', event_row.id, 'name', trim(target_name))
  );
  return new_zone_id;
end;
$$;

create function public.create_event_table(
  target_event uuid,
  target_zone uuid,
  target_name text,
  target_description text,
  target_capacity integer,
  target_base_price_amount bigint,
  target_currency char(3),
  target_service_fee_bps integer,
  target_access_gate uuid,
  target_benefits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  zone_row public.table_zones;
  new_table_id uuid;
  next_sort_order integer;
  configured_capacity bigint;
  benefit jsonb;
  benefit_index integer := 0;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into zone_row from public.table_zones
  where id = target_zone and event_id = event_row.id and organization_id = event_row.organization_id and active
  for update;
  if not found then raise exception 'INVALID_TABLE_ZONE' using errcode = 'P0001'; end if;
  if target_access_gate is not null and not exists (
    select 1 from public.access_gates g
    where g.id = target_access_gate and g.event_id = event_row.id
      and g.organization_id = event_row.organization_id
  ) then
    raise exception 'INVALID_ACCESS_GATE' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 100
    or char_length(coalesce(target_description, '')) > 1000
    or target_capacity not between 1 and 500
    or target_base_price_amount < 0
    or target_currency <> event_row.currency
    or (target_service_fee_bps is not null and target_service_fee_bps not between 0 and 10000) then
    raise exception 'INVALID_EVENT_TABLE' using errcode = 'P0001';
  end if;
  if target_benefits is null then target_benefits := '[]'::jsonb; end if;
  if jsonb_typeof(target_benefits) <> 'array' or jsonb_array_length(target_benefits) > 20 then
    raise exception 'INVALID_TABLE_BENEFITS' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_benefits) supplied(value)
    where supplied.value->>'entitlement_type' not in ('product', 'drink', 'generic')
      or char_length(trim(coalesce(supplied.value->>'name', ''))) not between 1 and 100
      or coalesce(supplied.value->>'quantity', '') !~ '^[1-9][0-9]*$'
      or (supplied.value ? 'reference_id'
        and nullif(supplied.value->>'reference_id', '') is not null
        and supplied.value->>'reference_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ) then
    raise exception 'INVALID_TABLE_BENEFITS' using errcode = 'P0001';
  end if;

  select
    coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = event_row.id and t.active), 0)
    + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = event_row.id and et.active), 0)
  into configured_capacity;
  if configured_capacity + target_capacity > event_row.capacity then
    raise exception 'EVENT_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  select coalesce(max(et.sort_order), -1) + 1 into next_sort_order
  from public.event_tables et where et.table_zone_id = zone_row.id;
  insert into public.event_tables (
    organization_id, event_id, table_zone_id, access_gate_id,
    name, description, capacity, base_price_amount, currency,
    service_fee_bps, sort_order
  ) values (
    event_row.organization_id, event_row.id, zone_row.id, target_access_gate,
    trim(target_name), trim(coalesce(target_description, '')), target_capacity,
    target_base_price_amount, event_row.currency, target_service_fee_bps, next_sort_order
  ) returning id into new_table_id;

  for benefit in select value from jsonb_array_elements(target_benefits) loop
    insert into public.table_entitlement_templates (
      organization_id, event_id, event_table_id, entitlement_type,
      reference_id, name, quantity, metadata, sort_order
    ) values (
      event_row.organization_id, event_row.id, new_table_id,
      (benefit->>'entitlement_type')::public.entitlement_type,
      nullif(benefit->>'reference_id', '')::uuid,
      trim(benefit->>'name'), (benefit->>'quantity')::integer,
      coalesce(benefit->'metadata', '{}'::jsonb), benefit_index
    );
    benefit_index := benefit_index + 1;
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_row.organization_id, auth.uid(), 'event_table.created', 'event_table', new_table_id,
    jsonb_build_object(
      'event_id', event_row.id, 'name', trim(target_name),
      'capacity', target_capacity, 'base_price_amount', target_base_price_amount
    )
  );
  return new_table_id;
end;
$$;

create function public.set_event_table_active(target_table uuid, target_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_row public.event_tables;
  event_row public.events;
  configured_capacity bigint;
begin
  select * into table_row from public.event_tables where id = target_table for update;
  if not found or auth.uid() is null or not public.can_manage_org(table_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into event_row from public.events where id = table_row.event_id for update;
  update public.table_holds
  set status = 'expired'
  where event_table_id = table_row.id and status = 'active' and expires_at <= now();
  if not target_active and exists (
    select 1 from public.table_holds h
    where h.event_table_id = table_row.id and h.status in ('active', 'consumed', 'refund_review')
  ) then
    raise exception 'TABLE_NOT_DISABLEABLE' using errcode = 'P0001';
  end if;
  if target_active and not table_row.active then
    select
      coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = event_row.id and t.active), 0)
      + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = event_row.id and et.active), 0)
    into configured_capacity;
    if configured_capacity + table_row.capacity > event_row.capacity then
      raise exception 'EVENT_CAPACITY_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;
  update public.event_tables set active = target_active where id = table_row.id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    table_row.organization_id, auth.uid(),
    case when target_active then 'event_table.enabled' else 'event_table.disabled' end,
    'event_table', table_row.id, jsonb_build_object('active', target_active)
  );
end;
$$;

create function public.get_public_event_tables(target_event uuid)
returns table (
  id uuid,
  event_id uuid,
  table_zone_id uuid,
  zone_name text,
  name text,
  description text,
  capacity integer,
  base_price_amount bigint,
  currency char(3),
  service_fee_bps integer,
  sort_order integer,
  availability_status text,
  benefits jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select et.id, et.event_id, et.table_zone_id, z.name, et.name, et.description,
    et.capacity, et.base_price_amount, et.currency,
    coalesce(et.service_fee_bps, o.table_service_fee_bps, o.service_fee_bps),
    et.sort_order,
    case
      when exists (
        select 1 from public.table_holds h
        where h.event_table_id = et.id and h.status in ('consumed', 'refund_review')
      ) then 'sold'
      when exists (
        select 1 from public.table_holds h
        where h.event_table_id = et.id and h.status = 'active' and h.expires_at > now()
      ) then 'held'
      else 'available'
    end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', template.entitlement_type,
        'name', template.name,
        'quantity', template.quantity
      ) order by template.sort_order, template.id)
      from public.table_entitlement_templates template
      where template.event_table_id = et.id
    ), '[]'::jsonb)
  from public.event_tables et
  join public.table_zones z on z.id = et.table_zone_id and z.active
  join public.events e on e.id = et.event_id and e.status = 'published'
  join public.organizations o on o.id = et.organization_id
  where et.event_id = target_event and et.active
  order by z.sort_order, et.sort_order, et.name;
$$;

create or replace function public.publish_event(target_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  configured_capacity bigint;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if event_row.starts_at <= now() then
    raise exception 'EVENT_MUST_BE_FUTURE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.ticket_types t
    where t.event_id = target_event and t.active and t.quantity > 0
  ) and not exists (
    select 1 from public.event_tables et
    where et.event_id = target_event and et.active
  ) then
    raise exception 'SELLABLE_ITEM_REQUIRED' using errcode = 'P0001';
  end if;
  select
    coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = target_event and t.active), 0)
    + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = target_event and et.active), 0)
  into configured_capacity;
  if configured_capacity > event_row.capacity then
    raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;
  update public.events set status = 'published', published_at = now() where id = target_event;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.published', 'event', target_event);
end;
$$;

revoke all on function public.create_table_zone(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_event_table(uuid, uuid, text, text, integer, bigint, char, integer, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_event_table_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_public_event_tables(uuid) from public, anon, authenticated;
revoke all on function public.publish_event(uuid) from public, anon, authenticated;

grant execute on function public.create_table_zone(uuid, text, text) to authenticated;
grant execute on function public.create_event_table(uuid, uuid, text, text, integer, bigint, char, integer, uuid, jsonb) to authenticated;
grant execute on function public.set_event_table_active(uuid, boolean) to authenticated;
grant execute on function public.get_public_event_tables(uuid) to anon, authenticated;

create or replace function public.get_public_events_discovery()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  cover_image_url text,
  starts_at timestamptz,
  currency char(3),
  venue_name text,
  venue_address text,
  city text,
  province text,
  timezone text,
  from_price_amount bigint,
  has_availability boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id, e.slug, e.name, e.description, e.cover_image_url, e.starts_at, e.currency,
    v.name, v.address, v.city, v.province, v.timezone,
    case
      when ticket_inventory.from_price is null then table_inventory.from_price
      when table_inventory.from_price is null then ticket_inventory.from_price
      else least(ticket_inventory.from_price, table_inventory.from_price)
    end,
    coalesce(ticket_inventory.available, false) or coalesce(table_inventory.available, false)
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join lateral (
    select min(t.price_amount) filter (where t.sale_open and t.price_amount > 0) as from_price,
      coalesce(bool_or(t.sale_open), false) as available
    from public.get_public_ticket_types(e.id) t
  ) ticket_inventory on true
  left join lateral (
    select min(t.base_price_amount) filter (
        where t.availability_status = 'available' and t.base_price_amount > 0
      ) as from_price,
      coalesce(bool_or(t.availability_status = 'available'), false) as available
    from public.get_public_event_tables(e.id) t
  ) table_inventory on true
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
