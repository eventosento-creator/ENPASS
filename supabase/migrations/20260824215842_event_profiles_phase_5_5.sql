create type public.event_profile as enum (
  'nightlife', 'concert', 'festival', 'conference',
  'sports', 'expo', 'private_event', 'other'
);

alter table public.events
  add column profile public.event_profile not null default 'nightlife',
  add column tickets_enabled boolean not null default true,
  add column promoters_enabled boolean not null default true,
  add column tables_enabled boolean not null default true,
  add column access_enabled boolean not null default true,
  add column pos_enabled boolean not null default false,
  add column inventory_enabled boolean not null default false;

comment on column public.events.profile is 'Operational preset metadata; changing it never overwrites explicit capabilities.';
comment on column public.events.pos_enabled is 'Reserved for FASE 6. Not exposed in the current product UI.';
comment on column public.events.inventory_enabled is 'Reserved for FASE 6. Not exposed in the current product UI.';

create function public.update_event_configuration(
  target_event uuid,
  target_profile public.event_profile,
  target_tickets_enabled boolean,
  target_promoters_enabled boolean,
  target_tables_enabled boolean,
  target_access_enabled boolean,
  target_pos_enabled boolean,
  target_inventory_enabled boolean
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
    inventory_enabled = target_inventory_enabled
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
end;
$$;

revoke all on function public.update_event_configuration(uuid, public.event_profile, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.update_event_configuration(uuid, public.event_profile, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

create function public.reject_disabled_event_module_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare enabled boolean;
begin
  execute format('select %I from public.events where id = $1', tg_argv[0]) into enabled using new.event_id;
  if enabled is not true then
    raise exception 'EVENT_CAPABILITY_DISABLED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sale_phases_require_tickets before insert on public.sale_phases
for each row execute function public.reject_disabled_event_module_insert('tickets_enabled');
create trigger ticket_types_require_tickets before insert on public.ticket_types
for each row execute function public.reject_disabled_event_module_insert('tickets_enabled');
create trigger ticket_holds_require_tickets before insert on public.ticket_holds
for each row execute function public.reject_disabled_event_module_insert('tickets_enabled');
create trigger event_promoters_require_promoters before insert on public.event_promoters
for each row execute function public.reject_disabled_event_module_insert('promoters_enabled');
create trigger table_zones_require_tables before insert on public.table_zones
for each row execute function public.reject_disabled_event_module_insert('tables_enabled');
create trigger event_tables_require_tables before insert on public.event_tables
for each row execute function public.reject_disabled_event_module_insert('tables_enabled');
create trigger table_holds_require_tables before insert on public.table_holds
for each row execute function public.reject_disabled_event_module_insert('tables_enabled');
create trigger access_gates_require_access before insert on public.access_gates
for each row execute function public.reject_disabled_event_module_insert('access_enabled');
create trigger scanner_authorizations_require_access before insert on public.scanner_device_authorizations
for each row execute function public.reject_disabled_event_module_insert('access_enabled');

revoke all on function public.reject_disabled_event_module_insert() from public, anon, authenticated;

create function public.skip_disabled_promoter_tracking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events e where e.id = new.event_id and e.promoters_enabled
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger promoter_attributions_require_promoters before insert or update on public.promoter_attributions
for each row execute function public.skip_disabled_promoter_tracking();
create trigger promoter_visits_require_promoters before insert on public.promoter_link_visits
for each row execute function public.skip_disabled_promoter_tracking();
revoke all on function public.skip_disabled_promoter_tracking() from public, anon, authenticated;

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
    where t.event_id = target_event and t.active and t.publicly_available
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

create or replace function public.get_public_event_tables(target_event uuid)
returns table (
  id uuid, event_id uuid, table_zone_id uuid, zone_name text, name text,
  description text, capacity integer, base_price_amount bigint, currency char(3),
  service_fee_bps integer, sort_order integer, availability_status text, benefits jsonb
)
language sql stable security definer set search_path = '' as $$
  select et.id, et.event_id, et.table_zone_id, z.name, et.name, et.description,
    et.capacity, et.base_price_amount, et.currency,
    coalesce(et.service_fee_bps, o.table_service_fee_bps, o.service_fee_bps), et.sort_order,
    case
      when exists (select 1 from public.table_holds h where h.event_table_id = et.id and h.status in ('consumed', 'refund_review')) then 'sold'
      when exists (select 1 from public.table_holds h where h.event_table_id = et.id and h.status = 'active' and h.expires_at > now()) then 'held'
      else 'available'
    end,
    coalesce((select jsonb_agg(jsonb_build_object('type', template.entitlement_type, 'name', template.name, 'quantity', template.quantity)
      order by template.sort_order, template.id) from public.table_entitlement_templates template
      where template.event_table_id = et.id), '[]'::jsonb)
  from public.event_tables et
  join public.table_zones z on z.id = et.table_zone_id and z.active
  join public.events e on e.id = et.event_id and e.status = 'published' and e.tables_enabled
  join public.organizations o on o.id = et.organization_id
  where et.event_id = target_event and et.active
  order by z.sort_order, et.sort_order, et.name;
$$;

create function public.get_public_event_by_slug(target_slug text)
returns table (
  id uuid, venue_id uuid, name text, slug text, description text, cover_image_url text,
  starts_at timestamptz, doors_open_at timestamptz, ends_at timestamptz,
  capacity integer, require_document boolean, currency char(3),
  tickets_enabled boolean, tables_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.venue_id, e.name, e.slug, e.description, e.cover_image_url,
    e.starts_at, e.doors_open_at, e.ends_at, e.capacity, e.require_document,
    e.currency, e.tickets_enabled, e.tables_enabled
  from public.events e where e.slug = target_slug and e.status = 'published';
$$;

revoke all on function public.get_public_event_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;

create or replace function public.get_active_promoter_attribution(target_event uuid, target_session_hash text)
returns table (event_promoter_id uuid, promoter_id uuid, promoter_display_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ep.id, p.id, p.display_name, a.expires_at
  from public.promoter_attributions a
  join public.event_promoters ep on ep.id = a.event_promoter_id and ep.status = 'active'
  join public.promoters p on p.id = ep.promoter_id and p.status = 'active'
  join public.promoter_attribution_sessions s on s.id = a.attribution_session_id
  join public.events e on e.id = a.event_id and e.promoters_enabled
  where a.event_id = target_event and s.session_token_hash = target_session_hash
    and s.expires_at > now() and a.expires_at > now();
$$;

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
  ) then raise exception 'TABLE_REQUIRED' using errcode = 'P0001'; end if;
  select
    case when event_row.tickets_enabled then coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = target_event and t.active), 0) else 0 end
    + case when event_row.tables_enabled then coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = target_event and et.active), 0) else 0 end
  into configured_capacity;
  if configured_capacity > event_row.capacity then raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001'; end if;
  update public.events set status = 'published', published_at = now() where id = target_event;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.published', 'event', target_event);
end;
$$;

alter function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean)
rename to duplicate_event_phase_5;

create function public.duplicate_event_with_options(
  target_event uuid, target_name text, target_slug text, target_starts_at timestamptz,
  preserve_tickets boolean, preserve_promoters boolean, preserve_tables boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source_event public.events; new_event_id uuid;
begin
  select * into source_event from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(source_event.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  new_event_id := public.duplicate_event_phase_5(
    target_event, target_name, target_slug, target_starts_at,
    preserve_promoters and source_event.promoters_enabled,
    preserve_tables and source_event.tables_enabled
  );
  update public.events set
    profile = source_event.profile,
    tickets_enabled = source_event.tickets_enabled,
    promoters_enabled = source_event.promoters_enabled,
    tables_enabled = source_event.tables_enabled,
    access_enabled = source_event.access_enabled,
    pos_enabled = source_event.pos_enabled,
    inventory_enabled = source_event.inventory_enabled
  where id = new_event_id;
  if not preserve_tickets then
    delete from public.ticket_types where event_id = new_event_id;
    delete from public.sale_phases where event_id = new_event_id;
  end if;
  return new_event_id;
end;
$$;

create function public.duplicate_event_with_options(
  target_event uuid, target_name text, target_slug text, target_starts_at timestamptz,
  preserve_promoters boolean, preserve_tables boolean
)
returns uuid language sql security definer set search_path = '' as $$
  select public.duplicate_event_with_options(target_event, target_name, target_slug, target_starts_at, true, preserve_promoters, preserve_tables);
$$;

revoke all on function public.duplicate_event_phase_5(uuid, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean) to authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean) to authenticated;

revoke all on function public.get_public_ticket_types(uuid) from public, anon, authenticated;
revoke all on function public.get_public_event_tables(uuid) from public, anon, authenticated;
revoke all on function public.get_active_promoter_attribution(uuid, text) from public, anon, authenticated;
revoke all on function public.publish_event(uuid) from public, anon, authenticated;
grant execute on function public.get_public_ticket_types(uuid), public.get_public_event_tables(uuid) to anon, authenticated;
grant execute on function public.get_active_promoter_attribution(uuid, text) to service_role;
grant execute on function public.publish_event(uuid) to authenticated;
