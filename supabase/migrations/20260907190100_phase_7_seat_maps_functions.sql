-- Phase 7 (part 2): columns/constraints/functions that reference the new 'seat' enum value.

alter table public.order_items
  add column event_seat_id uuid references public.event_seats(id) on delete restrict,
  drop constraint order_items_typed_reference,
  add constraint order_items_typed_reference check (
    (item_type = 'ticket' and ticket_type_id is not null and event_table_id is null and event_seat_id is null)
    or (item_type = 'table' and ticket_type_id is null and event_table_id is not null and event_seat_id is null and quantity = 1)
    or (item_type = 'seat' and ticket_type_id is null and event_table_id is null and event_seat_id is not null and quantity = 1)
  );

create index order_items_event_seat_idx
  on public.order_items (event_seat_id) where event_seat_id is not null;

alter table public.tickets
  add column event_seat_id uuid references public.event_seats(id) on delete restrict,
  drop constraint tickets_typed_reference,
  add constraint tickets_typed_reference check (
    (ticket_type_id is not null and event_table_id is null and event_seat_id is null)
    or (ticket_type_id is null and event_table_id is not null and event_seat_id is null and unit_index = 1)
    or (ticket_type_id is null and event_table_id is null and event_seat_id is not null and unit_index = 1)
  );

create unique index tickets_event_seat_unique
  on public.tickets (event_seat_id) where event_seat_id is not null;

-- Producer: create a section and generate its full grid of seats in one transaction.
create function public.create_seat_map_section(
  target_event uuid,
  target_name text,
  target_description text,
  target_rows integer,
  target_seats_per_row integer,
  target_base_price_amount bigint,
  target_currency char(3),
  target_service_fee_bps integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  new_section_id uuid;
  next_sort_order integer;
  configured_capacity bigint;
  row_num integer;
  seat_num integer;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 100
    or char_length(coalesce(target_description, '')) > 500
    or target_rows not between 1 and 26
    or target_seats_per_row not between 1 and 60
    or target_base_price_amount < 0
    or target_currency <> event_row.currency
    or (target_service_fee_bps is not null and target_service_fee_bps not between 0 and 10000) then
    raise exception 'INVALID_SEAT_MAP_SECTION' using errcode = 'P0001';
  end if;

  select
    coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = event_row.id and t.active), 0)
    + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = event_row.id and et.active), 0)
    + coalesce((select count(*) from public.event_seats es
        join public.seat_map_sections s on s.id = es.section_id
        where es.event_id = event_row.id and es.active and s.active), 0)
  into configured_capacity;
  if configured_capacity + (target_rows * target_seats_per_row) > event_row.capacity then
    raise exception 'EVENT_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  select coalesce(max(s.sort_order), -1) + 1 into next_sort_order
  from public.seat_map_sections s where s.event_id = target_event;
  insert into public.seat_map_sections (
    organization_id, event_id, name, description, rows, seats_per_row,
    base_price_amount, currency, service_fee_bps, sort_order
  ) values (
    event_row.organization_id, event_row.id, trim(target_name), trim(coalesce(target_description, '')),
    target_rows, target_seats_per_row, target_base_price_amount, event_row.currency,
    target_service_fee_bps, next_sort_order
  ) returning id into new_section_id;

  for row_num in 1..target_rows loop
    for seat_num in 1..target_seats_per_row loop
      insert into public.event_seats (organization_id, event_id, section_id, row_label, seat_number)
      values (event_row.organization_id, event_row.id, new_section_id, chr(64 + row_num), seat_num);
    end loop;
  end loop;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_row.organization_id, auth.uid(), 'seat_map_section.created', 'seat_map_section', new_section_id,
    jsonb_build_object(
      'event_id', event_row.id, 'name', trim(target_name),
      'rows', target_rows, 'seats_per_row', target_seats_per_row
    )
  );
  return new_section_id;
end;
$$;

create function public.set_event_seat_active(target_seat uuid, target_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat_row public.event_seats;
  event_row public.events;
  configured_capacity bigint;
begin
  select * into seat_row from public.event_seats where id = target_seat for update;
  if not found or auth.uid() is null or not public.can_manage_org(seat_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into event_row from public.events where id = seat_row.event_id for update;
  update public.seat_holds
  set status = 'expired'
  where event_seat_id = seat_row.id and status = 'active' and expires_at <= now();
  if not target_active and exists (
    select 1 from public.seat_holds h
    where h.event_seat_id = seat_row.id and h.status in ('active', 'consumed', 'refund_review')
  ) then
    raise exception 'SEAT_NOT_DISABLEABLE' using errcode = 'P0001';
  end if;
  if target_active and not seat_row.active then
    select
      coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = event_row.id and t.active), 0)
      + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = event_row.id and et.active), 0)
      + coalesce((select count(*) from public.event_seats es
          join public.seat_map_sections s on s.id = es.section_id
          where es.event_id = event_row.id and es.active and s.active), 0)
    into configured_capacity;
    if configured_capacity + 1 > event_row.capacity then
      raise exception 'EVENT_CAPACITY_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;
  update public.event_seats set active = target_active where id = seat_row.id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    seat_row.organization_id, auth.uid(),
    case when target_active then 'event_seat.enabled' else 'event_seat.disabled' end,
    'event_seat', seat_row.id, jsonb_build_object('active', target_active)
  );
end;
$$;

create function public.get_public_event_seats(target_event uuid)
returns table (
  id uuid,
  event_id uuid,
  section_id uuid,
  section_name text,
  row_label text,
  seat_number integer,
  label text,
  base_price_amount bigint,
  currency char(3),
  service_fee_bps integer,
  sort_order integer,
  availability_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select es.id, es.event_id, es.section_id, s.name, es.row_label, es.seat_number, es.label,
    s.base_price_amount, s.currency,
    coalesce(s.service_fee_bps, o.table_service_fee_bps, o.service_fee_bps),
    s.sort_order,
    case
      when exists (
        select 1 from public.seat_holds h
        where h.event_seat_id = es.id and h.status in ('consumed', 'refund_review')
      ) then 'sold'
      when exists (
        select 1 from public.seat_holds h
        where h.event_seat_id = es.id and h.status = 'active' and h.expires_at > now()
      ) then 'held'
      else 'available'
    end
  from public.event_seats es
  join public.seat_map_sections s on s.id = es.section_id and s.active
  join public.events e on e.id = es.event_id and e.status = 'published' and e.seatmap_enabled
  join public.organizations o on o.id = es.organization_id
  where es.event_id = target_event and es.active
  order by s.sort_order, es.row_label, es.seat_number;
$$;

revoke all on function public.create_seat_map_section(uuid, text, text, integer, integer, bigint, char, integer) from public, anon, authenticated;
revoke all on function public.set_event_seat_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_public_event_seats(uuid) from public, anon, authenticated;
grant execute on function public.create_seat_map_section(uuid, text, text, integer, integer, bigint, char, integer) to authenticated;
grant execute on function public.set_event_seat_active(uuid, boolean) to authenticated;
grant execute on function public.get_public_event_seats(uuid) to anon, authenticated;

-- Event capability configuration: thread seatmap_enabled through alongside the other toggles.
create or replace function public.update_event_configuration(
  target_event uuid,
  target_profile public.event_profile,
  target_tickets_enabled boolean,
  target_promoters_enabled boolean,
  target_tables_enabled boolean,
  target_access_enabled boolean,
  target_pos_enabled boolean,
  target_inventory_enabled boolean,
  target_seatmap_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.events set
    profile = target_profile,
    tickets_enabled = target_tickets_enabled,
    promoters_enabled = target_promoters_enabled,
    tables_enabled = target_tables_enabled,
    access_enabled = target_access_enabled,
    pos_enabled = target_pos_enabled,
    inventory_enabled = target_inventory_enabled,
    seatmap_enabled = target_seatmap_enabled
  where id = target_event;

  if event_row.profile is distinct from target_profile then
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      event_row.organization_id, auth.uid(), 'event.profile.updated', 'event', target_event,
      jsonb_build_object('profile', event_row.profile), jsonb_build_object('profile', target_profile)
    );
  end if;
  if event_row.tickets_enabled is distinct from target_tickets_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tickets_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'tickets'));
  end if;
  if event_row.promoters_enabled is distinct from target_promoters_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_promoters_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'promoters'));
  end if;
  if event_row.tables_enabled is distinct from target_tables_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tables_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'tables'));
  end if;
  if event_row.access_enabled is distinct from target_access_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_access_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'access'));
  end if;
  if event_row.seatmap_enabled is distinct from target_seatmap_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_seatmap_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'seatmap'));
  end if;
end;
$$;

revoke all on function public.update_event_configuration(uuid, public.event_profile, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.update_event_configuration(uuid, public.event_profile, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_event_configuration(uuid, public.event_profile, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- Public discovery/event-detail: expose seatmap_enabled and fold seat pricing/availability into "from price".
drop function if exists public.get_public_event_by_slug(text);
create function public.get_public_event_by_slug(target_slug text)
returns table (
  id uuid, venue_id uuid, name text, slug text, description text, cover_image_url text,
  starts_at timestamptz, doors_open_at timestamptz, ends_at timestamptz,
  capacity integer, require_document boolean, currency char(3),
  tickets_enabled boolean, tables_enabled boolean, seatmap_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.venue_id, e.name, e.slug, e.description, e.cover_image_url,
    e.starts_at, e.doors_open_at, e.ends_at, e.capacity, e.require_document,
    e.currency, e.tickets_enabled, e.tables_enabled, e.seatmap_enabled
  from public.events e where e.slug = target_slug and e.status = 'published';
$$;

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
    least(
      ticket_inventory.from_price,
      least(table_inventory.from_price, seat_inventory.from_price)
    ),
    coalesce(ticket_inventory.available, false)
      or coalesce(table_inventory.available, false)
      or coalesce(seat_inventory.available, false)
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
  left join lateral (
    select min(t.base_price_amount) filter (
        where t.availability_status = 'available' and t.base_price_amount > 0
      ) as from_price,
      coalesce(bool_or(t.availability_status = 'available'), false) as available
    from public.get_public_event_seats(e.id) t
  ) seat_inventory on true
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_event_by_slug(text) from public, anon, authenticated;
revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;

-- Publishing: a seatmap-only event must be sellable, and its seats count toward event capacity.
create or replace function public.publish_event(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events; configured_capacity bigint;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  if event_row.starts_at <= now() then raise exception 'EVENT_MUST_BE_FUTURE' using errcode = 'P0001'; end if;
  if event_row.tickets_enabled and not exists (
    select 1 from public.ticket_types t where t.event_id = target_event and t.active and t.quantity > 0
  ) then raise exception 'TICKET_TYPE_REQUIRED' using errcode = 'P0001'; end if;
  if event_row.tables_enabled and not event_row.tickets_enabled and not exists (
    select 1 from public.event_tables et where et.event_id = target_event and et.active
  ) and not (event_row.seatmap_enabled and exists (
    select 1 from public.event_seats es join public.seat_map_sections s on s.id = es.section_id
    where es.event_id = target_event and es.active and s.active
  )) then raise exception 'TABLE_REQUIRED' using errcode = 'P0001'; end if;
  if event_row.seatmap_enabled and not event_row.tickets_enabled and not event_row.tables_enabled and not exists (
    select 1 from public.event_seats es join public.seat_map_sections s on s.id = es.section_id
    where es.event_id = target_event and es.active and s.active
  ) then raise exception 'SEAT_MAP_REQUIRED' using errcode = 'P0001'; end if;
  select
    case when event_row.tickets_enabled then coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = target_event and t.active), 0) else 0 end
    + case when event_row.tables_enabled then coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = target_event and et.active), 0) else 0 end
    + case when event_row.seatmap_enabled then coalesce((select count(*) from public.event_seats es
        join public.seat_map_sections s on s.id = es.section_id
        where es.event_id = target_event and es.active and s.active), 0) else 0 end
  into configured_capacity;
  if configured_capacity > event_row.capacity then raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001'; end if;
  update public.events set status = 'published', published_at = now() where id = target_event;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.published', 'event', target_event);
end;
$$;

revoke all on function public.publish_event(uuid) from public, anon, authenticated;
grant execute on function public.publish_event(uuid) to authenticated;

-- Checkout: add a third 'seat' branch alongside 'ticket' and 'table'.
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

revoke all on function public.create_guest_checkout_internal(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- Payment fulfillment: recognize seat_holds alongside ticket_holds/table_holds when confirming a payment.
create or replace function public.process_payment_update(
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
  required_ticket_entries bigint := 0;
  required_table_entries bigint := 0;
  required_seat_entries bigint := 0;
  event_used bigint := 0;
  inventory_conflict boolean := false;
  hold_group record;
  table_hold_group record;
  seat_hold_group record;
begin
  if target_status not in (
    'pending', 'processing', 'approved', 'rejected', 'cancelled',
    'refunded', 'partially_refunded', 'charged_back'
  ) then
    raise exception 'INVALID_PROVIDER_STATUS' using errcode = 'P0001';
  end if;

  select * into payment_row from public.payments
  where public_id = target_payment_public_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into order_row from public.orders where id = payment_row.order_id for update;
  select * into event_row from public.events where id = order_row.event_id for update;

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
        status = 'error', requires_action = true,
        exception_code = 'amount_or_currency_mismatch'
    where id = payment_row.id;
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values (
      payment_row.organization_id, 'payment.amount_mismatch', 'payment', payment_row.id,
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
    where p.order_id = order_row.id and p.id <> payment_row.id and p.status = 'approved'
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
          status = 'approved_duplicate_charge', requires_action = true,
          exception_code = 'order_already_paid',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id, 'payment.duplicate_charge', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id)
      );
      return 'approved_duplicate_charge';
    end if;

    update public.ticket_holds h set status = 'expired'
    where h.event_id = order_row.event_id and h.status = 'active' and h.expires_at <= now();
    update public.table_holds h set status = 'expired'
    where h.event_id = order_row.event_id and h.status = 'active' and h.expires_at <= now();
    update public.seat_holds h set status = 'expired'
    where h.event_id = order_row.event_id and h.status = 'active' and h.expires_at <= now();
    update public.orders o set status = 'expired'
    where o.event_id = order_row.event_id and o.status = 'pending' and o.expires_at <= now();

    perform 1 from public.ticket_types t
    where t.id in (
      select h.ticket_type_id from public.ticket_holds h where h.order_id = order_row.id
    ) order by t.id for update;
    perform 1 from public.event_tables et
    where et.id in (
      select h.event_table_id from public.table_holds h where h.order_id = order_row.id
    ) order by et.id for update;
    perform 1 from public.event_seats es
    where es.id in (
      select h.event_seat_id from public.seat_holds h where h.order_id = order_row.id
    ) order by es.id for update;

    select coalesce(sum(h.quantity), 0) into required_ticket_entries
    from public.ticket_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    select coalesce(sum(et.capacity), 0) into required_table_entries
    from public.table_holds h
    join public.event_tables et on et.id = h.event_table_id
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    select count(*) into required_seat_entries
    from public.seat_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    if required_ticket_entries + required_table_entries + required_seat_entries = 0
      or order_row.status not in ('pending', 'expired') then
      inventory_conflict := true;
    end if;

    select
      coalesce((
        select sum(h.quantity) from public.ticket_holds h
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()))
      ), 0)
      + coalesce((
        select sum(et.capacity)
        from public.table_holds h
        join public.event_tables et on et.id = h.event_table_id
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ), 0)
      + coalesce((
        select count(*)
        from public.seat_holds h
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ), 0)
    into event_used;
    if event_used + required_ticket_entries + required_table_entries + required_seat_entries > event_row.capacity then
      inventory_conflict := true;
    end if;

    for hold_group in
      select h.ticket_type_id, sum(h.quantity)::bigint as required_quantity
      from public.ticket_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      group by h.ticket_type_id order by h.ticket_type_id
    loop
      if (
        select coalesce(sum(other_holds.quantity), 0)
        from public.ticket_holds other_holds
        where other_holds.ticket_type_id = hold_group.ticket_type_id
          and other_holds.order_id <> order_row.id
          and (other_holds.status = 'consumed'
            or (other_holds.status = 'active' and other_holds.expires_at > now()))
      ) + hold_group.required_quantity > (
        select t.quantity from public.ticket_types t where t.id = hold_group.ticket_type_id
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    for table_hold_group in
      select h.event_table_id
      from public.table_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      order by h.event_table_id
    loop
      if exists (
        select 1 from public.table_holds other_holds
        where other_holds.event_table_id = table_hold_group.event_table_id
          and other_holds.order_id <> order_row.id
          and (other_holds.status in ('consumed', 'refund_review')
            or (other_holds.status = 'active' and other_holds.expires_at > now()))
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    for seat_hold_group in
      select h.event_seat_id
      from public.seat_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      order by h.event_seat_id
    loop
      if exists (
        select 1 from public.seat_holds other_holds
        where other_holds.event_seat_id = seat_hold_group.event_seat_id
          and other_holds.order_id <> order_row.id
          and (other_holds.status in ('consumed', 'refund_review')
            or (other_holds.status = 'active' and other_holds.expires_at > now()))
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    if inventory_conflict then
      update public.payments
      set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
          provider_status = target_provider_status,
          provider_status_detail = target_provider_status_detail,
          status = 'approved_inventory_conflict', requires_action = true,
          exception_code = 'inventory_unavailable_after_approval',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;
      update public.orders set status = 'expired'
      where id = order_row.id and status = 'pending';
      update public.ticket_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';
      update public.table_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';
      update public.seat_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id, 'payment.approved_inventory_conflict', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id, 'requires_refund', true)
      );
      return 'approved_inventory_conflict';
    end if;

    update public.ticket_holds set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');
    update public.table_holds set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');
    update public.seat_holds set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');
    update public.orders set status = 'paid' where id = order_row.id;
    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
        provider_status = target_provider_status,
        provider_status_detail = target_provider_status_detail,
        status = 'approved', requires_action = false, exception_code = null,
        processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
        seller_net_amount = target_seller_net_amount,
        approved_at = coalesce(target_approved_at, now())
    where id = payment_row.id;
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values
      (payment_row.organization_id, 'payment.approved', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id)),
      (payment_row.organization_id, 'order.paid', 'order', order_row.id,
        jsonb_build_object('payment_id', payment_row.id));
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
    update public.table_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.seat_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
  end if;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    payment_row.organization_id, 'payment.' || target_status::text,
    'payment', payment_row.id, jsonb_build_object('provider_status', target_provider_status)
  );
  return target_status::text;
end;
$$;

-- Ticket issuance: a seat item behaves like a single ticket (no bundled entitlements).
create or replace function public.issue_tickets_for_paid_order(
  target_order_id uuid,
  credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  event_row public.events;
  customer_row public.customers;
  item_row public.order_items;
  table_row public.event_tables;
  seat_row public.event_seats;
  seat_section_row public.seat_map_sections;
  zone_name text;
  credential jsonb;
  expected_count integer;
  inserted_count integer := 0;
  existing_count integer := 0;
  final_count integer;
  final_entitlement_count integer;
begin
  if jsonb_typeof(credentials) <> 'array' then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;
  select * into order_row from public.orders where id = target_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'paid' then raise exception 'ORDER_NOT_PAID' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = order_row.event_id;
  select * into customer_row from public.customers where id = order_row.customer_id;
  select coalesce(sum(case when item_type = 'ticket' then quantity else 1 end), 0)::integer
  into expected_count from public.order_items where order_id = order_row.id;
  if expected_count < 1 or jsonb_array_length(credentials) <> expected_count then
    raise exception 'INVALID_TICKET_CREDENTIAL_COUNT' using errcode = 'P0001';
  end if;
  if (
    select count(*) from (
      select value->>'order_item_id', value->>'unit_index'
      from jsonb_array_elements(credentials)
      group by value->>'order_item_id', value->>'unit_index'
    ) supplied_units
  ) <> expected_count then
    raise exception 'DUPLICATE_TICKET_CREDENTIAL_UNIT' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(credentials) supplied(value)
    left join public.order_items oi
      on oi.id::text = supplied.value->>'order_item_id' and oi.order_id = order_row.id
    where oi.id is null
      or supplied.value->>'unit_index' !~ '^[1-9][0-9]*$'
      or (supplied.value->>'unit_index')::integer > case when oi.item_type = 'ticket' then oi.quantity else 1 end
      or supplied.value->>'qr_token_hash' !~ '^[0-9a-f]{64}$'
      or char_length(coalesce(supplied.value->>'qr_token_encrypted', '')) < 32
      or supplied.value->>'short_code' !~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$'
  ) then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;

  for item_row in
    select * from public.order_items where order_id = order_row.id order by id for update
  loop
    if item_row.item_type = 'ticket' then
      for unit_number in 1..item_row.quantity loop
        if exists (
          select 1 from public.tickets
          where order_item_id = item_row.id and unit_index = unit_number
        ) then
          existing_count := existing_count + 1;
          continue;
        end if;
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = unit_number;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, ticket_type_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, valid_from, valid_until, short_code,
          qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          item_row.ticket_type_id, order_row.customer_id, unit_number,
          customer_row.first_name, customer_row.last_name, customer_row.document,
          coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end loop;
    elsif item_row.item_type = 'seat' then
      select * into seat_row from public.event_seats es where es.id = item_row.event_seat_id for update;
      if seat_row.id is null then raise exception 'EVENT_SEAT_NOT_FOUND' using errcode = 'P0001'; end if;
      select s.name into zone_name from public.seat_map_sections s where s.id = seat_row.section_id;
      if exists (select 1 from public.tickets where order_item_id = item_row.id and unit_index = 1) then
        existing_count := existing_count + 1;
      else
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = 1;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, event_seat_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, valid_from, valid_until, sector,
          short_code, qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          seat_row.id, order_row.customer_id, 1,
          customer_row.first_name, customer_row.last_name, customer_row.document,
          coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          zone_name || ' · ' || seat_row.label,
          credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end if;
    else
      select * into table_row
      from public.event_tables et
      where et.id = item_row.event_table_id for update;
      if table_row.id is null then raise exception 'EVENT_TABLE_NOT_FOUND' using errcode = 'P0001'; end if;
      select z.name into zone_name from public.table_zones z where z.id = table_row.table_zone_id;
      if exists (select 1 from public.tickets where order_item_id = item_row.id and unit_index = 1) then
        existing_count := existing_count + 1;
      else
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = 1;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, event_table_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, max_entries, valid_from, valid_until, sector,
          short_code, qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          table_row.id, order_row.customer_id, 1,
          customer_row.first_name, customer_row.last_name, customer_row.document,
          table_row.capacity, coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          zone_name, credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end if;
      insert into public.entitlements (
        organization_id, event_id, order_id, order_item_id, event_table_id,
        entitlement_type, name, quantity, metadata
      ) values (
        order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
        table_row.id, 'access', 'Acceso', table_row.capacity,
        jsonb_build_object('credential_mode', 'group')
      ) on conflict (order_item_id) where entitlement_type = 'access' do nothing;
      insert into public.entitlements (
        organization_id, event_id, order_id, order_item_id, event_table_id,
        template_id, entitlement_type, reference_id, name, quantity, metadata
      )
      select order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
        table_row.id, template.id, template.entitlement_type, template.reference_id,
        template.name, template.quantity, template.metadata
      from public.table_entitlement_templates template
      where template.event_table_id = table_row.id
      on conflict (order_item_id, template_id) where template_id is not null do nothing;
    end if;
  end loop;

  select count(*)::integer into final_count from public.tickets where order_id = order_row.id;
  if final_count <> expected_count then
    raise exception 'TICKET_ISSUANCE_INCOMPLETE' using errcode = 'P0001';
  end if;
  select count(*)::integer into final_entitlement_count
  from public.entitlements where order_id = order_row.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  select order_row.organization_id, 'table.fulfilled', 'event_table', item.event_table_id,
    jsonb_build_object('order_id', order_row.id, 'order_item_id', item.id)
  from public.order_items item
  where item.order_id = order_row.id and item.item_type = 'table'
    and not exists (
      select 1 from public.audit_logs log
      where log.action = 'table.fulfilled' and log.entity_id = item.event_table_id
        and log.after_data->>'order_id' = order_row.id::text
    );
  return jsonb_build_object(
    'order_id', order_row.id, 'expected_count', expected_count,
    'inserted_count', inserted_count, 'existing_count', existing_count,
    'ticket_count', final_count, 'entitlement_count', final_entitlement_count
  );
end;
$$;

-- Refunds: release a seat hold back to available when refunded before doors and unused, mirroring tables.
create function public.refund_seat_fulfillment_after_order_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hold_row record;
  used_entry_count integer;
  release_seat boolean;
begin
  if new.status = 'refunded' and old.status is distinct from new.status then
    for hold_row in
      select h.id, h.organization_id, h.event_seat_id, e.starts_at
      from public.seat_holds h
      join public.events e on e.id = h.event_id
      where h.order_id = new.id and h.status = 'consumed'
      order by h.event_seat_id for update of h
    loop
      select coalesce(max(t.used_entries), 0) into used_entry_count
      from public.tickets t
      where t.order_id = new.id and t.event_seat_id = hold_row.event_seat_id;
      release_seat := hold_row.starts_at > now() and used_entry_count = 0;
      update public.seat_holds
      set status = case when release_seat then 'cancelled'::public.seat_hold_status else 'refund_review'::public.seat_hold_status end
      where id = hold_row.id;
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        hold_row.organization_id,
        case when release_seat then 'seat.refunded_released' else 'seat.refunded_review' end,
        'event_seat', hold_row.event_seat_id,
        jsonb_build_object(
          'order_id', new.id, 'released', release_seat, 'used_entries', used_entry_count
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_refund_seat_fulfillment
after update of status on public.orders
for each row execute function public.refund_seat_fulfillment_after_order_refund();

revoke all on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.issue_tickets_for_paid_order(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_seat_fulfillment_after_order_refund() from public, anon, authenticated;

grant execute on function public.create_guest_checkout_internal(uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) to service_role;
grant execute on function public.issue_tickets_for_paid_order(uuid, jsonb) to service_role;
