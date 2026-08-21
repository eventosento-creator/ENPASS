create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('owner', 'admin');
create type public.event_status as enum ('draft', 'published', 'sold_out', 'finished', 'cancelled');
create type public.order_status as enum ('pending', 'expired', 'cancelled');
create type public.order_channel as enum ('ticket_web', 'admin');
create type public.fee_payer as enum ('buyer', 'producer', 'mixed');
create type public.ticket_hold_status as enum ('active', 'consumed', 'expired', 'cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  default_currency char(3) not null default 'ARS',
  service_fee_bps integer not null default 0 check (service_fee_bps between 0 and 10000),
  fee_payer public.fee_payer not null default 'buyer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  address text not null check (char_length(address) between 3 and 200),
  city text not null,
  province text not null,
  capacity integer not null check (capacity > 0),
  timezone text not null default 'America/Argentina/Mendoza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 4000),
  cover_image_url text,
  starts_at timestamptz not null,
  doors_open_at timestamptz,
  ends_at timestamptz,
  status public.event_status not null default 'draft',
  capacity integer not null check (capacity > 0),
  require_document boolean not null default false,
  currency char(3) not null default 'ARS',
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (doors_open_at is null or doors_open_at <= starts_at),
  check (ends_at is null or ends_at > starts_at),
  check ((status = 'published' and published_at is not null) or status <> 'published')
);

create table public.sale_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  activate_next_when_sold_out boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, sort_order)
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  sale_phase_id uuid references public.sale_phases(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  price_amount bigint not null check (price_amount >= 0),
  currency char(3) not null default 'ARS',
  quantity integer not null check (quantity > 0),
  max_per_order integer not null default 6 check (max_per_order between 1 and 20),
  sales_start timestamptz,
  sales_end timestamptz,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name),
  check (sales_end is null or sales_start is null or sales_end > sales_start)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  document text,
  created_at timestamptz not null default now()
);

create unique index customers_org_email_unique on public.customers (organization_id, lower(email));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  channel public.order_channel not null default 'ticket_web',
  status public.order_status not null default 'pending',
  subtotal_amount bigint not null check (subtotal_amount >= 0),
  service_fee_amount bigint not null check (service_fee_amount >= 0),
  total_amount bigint not null check (total_amount >= 0),
  currency char(3) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_amount = subtotal_amount + service_fee_amount)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_amount bigint not null check (unit_price_amount >= 0),
  line_total_amount bigint not null check (line_total_amount >= 0),
  currency char(3) not null,
  created_at timestamptz not null default now(),
  check (line_total_amount = unit_price_amount * quantity)
);

create table public.ticket_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  status public.ticket_hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index venues_org_idx on public.venues(organization_id);
create index events_org_starts_idx on public.events(organization_id, starts_at);
create index ticket_types_event_idx on public.ticket_types(event_id, sort_order);
create index orders_event_created_idx on public.orders(event_id, created_at);
create index ticket_holds_active_idx on public.ticket_holds(event_id, expires_at) where status = 'active';

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger venues_touch before update on public.venues for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger ticket_types_touch before update on public.ticket_types for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_manage_org(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.can_manage_org(uuid) from public;
grant execute on function public.is_org_member(uuid), public.can_manage_org(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.sale_phases enable row level security;
alter table public.ticket_types enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.ticket_holds enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_member_select on public.organizations for select to authenticated using ((select public.is_org_member(id)));
create policy organizations_owner_update on public.organizations for update to authenticated using ((select public.can_manage_org(id))) with check ((select public.can_manage_org(id)));
create policy members_member_select on public.organization_members for select to authenticated using ((select public.is_org_member(organization_id)));
create policy members_owner_write on public.organization_members for all to authenticated using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));

create policy venues_member_select on public.venues for select to authenticated using ((select public.is_org_member(organization_id)));
create policy venues_public_event_select on public.venues for select to anon using (exists (select 1 from public.events e where e.venue_id = public.venues.id and e.status = 'published'));
create policy venues_manager_insert on public.venues for insert to authenticated with check ((select public.can_manage_org(organization_id)));
create policy venues_manager_update on public.venues for update to authenticated using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));
create policy venues_manager_delete on public.venues for delete to authenticated using ((select public.can_manage_org(organization_id)));

create policy events_public_select on public.events for select to anon using (status = 'published');
create policy events_member_select on public.events for select to authenticated using (status = 'published' or (select public.is_org_member(organization_id)));
create policy events_manager_insert on public.events for insert to authenticated with check ((select public.can_manage_org(organization_id)) and created_by = (select auth.uid()));
create policy events_manager_update on public.events for update to authenticated using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));
create policy events_manager_delete on public.events for delete to authenticated using ((select public.can_manage_org(organization_id)) and status = 'draft');

create policy phases_public_select on public.sale_phases for select to anon using (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy phases_member_select on public.sale_phases for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or (select public.is_org_member(e.organization_id)))));
create policy phases_manager_write on public.sale_phases for all to authenticated using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));

create policy types_public_select on public.ticket_types for select to anon using (exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy types_member_select on public.ticket_types for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and (e.status = 'published' or (select public.is_org_member(e.organization_id)))));
create policy types_manager_write on public.ticket_types for all to authenticated using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));

create policy customers_manager_select on public.customers for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy orders_manager_select on public.orders for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy items_manager_select on public.order_items for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy holds_manager_select on public.ticket_holds for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy audit_manager_select on public.audit_logs for select to authenticated using ((select public.can_manage_org(organization_id)));

grant usage on schema public to anon, authenticated;
grant select on public.venues, public.events, public.sale_phases, public.ticket_types to anon;
grant select, insert, update, delete on public.organizations, public.organization_members, public.venues, public.events, public.sale_phases, public.ticket_types to authenticated;
grant select on public.customers, public.orders, public.order_items, public.ticket_holds, public.audit_logs to authenticated;

create or replace function public.create_organization(org_name text, org_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_org_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(trim(org_name)) < 2 or org_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'INVALID_ORGANIZATION' using errcode = 'P0001';
  end if;
  insert into public.organizations(name, slug) values (trim(org_name), org_slug) returning id into new_org_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_org_id, auth.uid(), 'owner');
  return new_org_id;
end;
$$;
revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

create or replace function public.publish_event(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  if event_row.starts_at <= now() then raise exception 'EVENT_MUST_BE_FUTURE' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ticket_types t where t.event_id = target_event and t.active and t.quantity > 0) then
    raise exception 'TICKET_TYPE_REQUIRED' using errcode = 'P0001';
  end if;
  if (select coalesce(sum(quantity), 0) from public.ticket_types where event_id = target_event and active) > event_row.capacity then
    raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;
  update public.events set status = 'published', published_at = now() where id = target_event;
  insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.published', 'event', target_event);
end;
$$;
revoke all on function public.publish_event(uuid) from public;
grant execute on function public.publish_event(uuid) to authenticated;

create or replace function public.create_guest_checkout(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb
) returns table (order_public_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
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
  if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) = 0 then raise exception 'EMPTY_SELECTION' using errcode = 'P0001'; end if;
  if char_length(trim(buyer_first_name)) < 1 or char_length(trim(buyer_last_name)) < 1 or buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_BUYER' using errcode = 'P0001';
  end if;
  select * into event_row from public.events where id = target_event and status = 'published' for update;
  if not found then raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0001'; end if;
  if event_row.require_document and nullif(trim(buyer_document), '') is null then raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001'; end if;
  select * into org_row from public.organizations where id = event_row.organization_id;

  update public.ticket_holds h set status = 'expired' where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  select coalesce(sum(h.quantity), 0) into event_reserved from public.ticket_holds h where h.event_id = target_event and h.status = 'active' and h.expires_at > now();

  for selection in select value from jsonb_array_elements(selections) loop
    requested := (selection->>'quantity')::integer;
    select * into type_row from public.ticket_types where id = (selection->>'ticket_type_id')::uuid and event_id = target_event and active for update;
    if not found or requested < 1 or requested > type_row.max_per_order then raise exception 'INVALID_SELECTION' using errcode = 'P0001'; end if;
    if type_row.sales_start is not null and type_row.sales_start > now() then raise exception 'SALES_NOT_STARTED' using errcode = 'P0001'; end if;
    if type_row.sales_end is not null and type_row.sales_end <= now() then raise exception 'SALES_ENDED' using errcode = 'P0001'; end if;
    select coalesce(sum(h.quantity), 0) into type_reserved from public.ticket_holds h where h.ticket_type_id = type_row.id and h.status = 'active' and h.expires_at > now();
    if type_reserved + requested > type_row.quantity then raise exception 'TICKET_TYPE_SOLD_OUT' using errcode = 'P0001'; end if;
    event_reserved := event_reserved + requested;
    if event_reserved > event_row.capacity then raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001'; end if;
    subtotal := subtotal + type_row.price_amount * requested;
  end loop;

  if org_row.fee_payer = 'buyer' then fee := round(subtotal * org_row.service_fee_bps::numeric / 10000); end if;

  insert into public.customers(organization_id, first_name, last_name, email, phone, document)
  values (event_row.organization_id, trim(buyer_first_name), trim(buyer_last_name), lower(trim(buyer_email)), nullif(trim(buyer_phone), ''), nullif(trim(buyer_document), ''))
  on conflict (organization_id, lower(email)) do update set first_name = excluded.first_name, last_name = excluded.last_name, phone = coalesce(excluded.phone, public.customers.phone), document = coalesce(excluded.document, public.customers.document)
  returning id into customer_id;

  insert into public.orders(public_id, organization_id, event_id, customer_id, subtotal_amount, service_fee_amount, total_amount, currency, expires_at)
  values (generated_public_id, event_row.organization_id, target_event, customer_id, subtotal, fee, subtotal + fee, event_row.currency, expiry)
  returning id into order_id;

  for selection in select value from jsonb_array_elements(selections) loop
    requested := (selection->>'quantity')::integer;
    select * into type_row from public.ticket_types where id = (selection->>'ticket_type_id')::uuid;
    insert into public.order_items(organization_id, order_id, ticket_type_id, item_name, quantity, unit_price_amount, line_total_amount, currency)
    values (event_row.organization_id, order_id, type_row.id, type_row.name, requested, type_row.price_amount, type_row.price_amount * requested, type_row.currency);
    insert into public.ticket_holds(organization_id, event_id, ticket_type_id, order_id, quantity, expires_at)
    values (event_row.organization_id, target_event, type_row.id, order_id, requested, expiry);
  end loop;
  return query select generated_public_id, expiry;
end;
$$;
revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.get_public_order(target_public_id text)
returns table (public_id text, event_name text, status public.order_status, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint, currency char(3), expires_at timestamptz, items jsonb)
language sql stable security definer set search_path = '' as $$
  select o.public_id, e.name, case when o.status = 'pending' and o.expires_at <= now() then 'expired'::public.order_status else o.status end,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.currency, o.expires_at,
    coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'quantity', i.quantity, 'unit_price_amount', i.unit_price_amount) order by i.created_at), '[]'::jsonb)
  from public.orders o join public.events e on e.id = o.event_id join public.order_items i on i.order_id = o.id
  where o.public_id = target_public_id
  group by o.id, e.name;
$$;
revoke all on function public.get_public_order(text) from public;
grant execute on function public.get_public_order(text) to anon, authenticated;

create or replace function public.get_public_ticket_types(target_event uuid)
returns table (
  id uuid, organization_id uuid, event_id uuid, name text, description text,
  price_amount bigint, currency char(3), quantity integer, max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, active boolean, sort_order integer,
  available_quantity bigint, sale_open boolean
) language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      greatest(t.quantity - coalesce(sum(h.quantity) filter (where h.status = 'active' and h.expires_at > now()), 0), 0)::bigint as available,
      coalesce(p.sort_order, t.sort_order) as phase_order
    from public.ticket_types t
    left join public.sale_phases p on p.id = t.sale_phase_id
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published'
    where t.event_id = target_event and t.active
    group by t.id, p.sort_order
  ), open_phase as (
    select min(phase_order) as phase_order from inventory where available > 0
  )
  select i.id, i.organization_id, i.event_id, i.name, i.description, i.price_amount, i.currency,
    i.quantity, i.max_per_order, i.sales_start, i.sales_end, i.active, i.sort_order, i.available,
    (i.available > 0 and i.phase_order = o.phase_order and (i.sales_start is null or i.sales_start <= now()) and (i.sales_end is null or i.sales_end > now()))
  from inventory i cross join open_phase o
  order by i.phase_order, i.sort_order;
$$;
revoke all on function public.get_public_ticket_types(uuid) from public;
grant execute on function public.get_public_ticket_types(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy event_covers_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'event-covers');
create policy event_covers_member_insert on storage.objects for insert to authenticated with check (bucket_id = 'event-covers' and (storage.foldername(name))[1] in (select organization_id::text from public.organization_members where user_id = (select auth.uid())));
create policy event_covers_member_update on storage.objects for update to authenticated using (bucket_id = 'event-covers' and (storage.foldername(name))[1] in (select organization_id::text from public.organization_members where user_id = (select auth.uid()))) with check (bucket_id = 'event-covers');
create policy event_covers_member_delete on storage.objects for delete to authenticated using (bucket_id = 'event-covers' and (storage.foldername(name))[1] in (select organization_id::text from public.organization_members where user_id = (select auth.uid())));
