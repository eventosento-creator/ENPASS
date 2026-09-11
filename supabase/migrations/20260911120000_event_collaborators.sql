-- Fase 9.1: colaboradores por evento. Un usuario sin fila en organization_members puede
-- recibir acceso operativo a UN evento puntual (Entradas, Invitados, Mesas, Accesos) sin
-- ver el resto de la organización. RRPP, Asientos y Caja quedan owner/admin-only por ahora.

create table public.event_collaborators (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_collaborators_user_idx on public.event_collaborators(user_id);
create index event_collaborators_event_idx on public.event_collaborators(event_id);

create table public.event_collaborator_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_collaborator_invitations_event_idx on public.event_collaborator_invitations(event_id);

alter table public.event_collaborators enable row level security;
alter table public.event_collaborator_invitations enable row level security;

-- public.can_manage_event: colaborador asignado a ESE evento, o manager de la organización dueña.
create or replace function public.can_manage_event(target_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.event_collaborators c
      where c.event_id = target_event and c.user_id = (select auth.uid())
    )
    or public.can_manage_org((select organization_id from public.events where id = target_event));
$$;
revoke all on function public.can_manage_event(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_event(uuid) to authenticated;

create policy event_collaborators_member_select on public.event_collaborators
  for select to authenticated
  using ((select public.can_manage_org(organization_id)) or user_id = (select auth.uid()));
create policy event_collaborators_manager_write on public.event_collaborators
  for all to authenticated
  using ((select public.can_manage_org(organization_id)))
  with check ((select public.can_manage_org(organization_id)));

grant select on public.event_collaborators to authenticated;
grant all on public.event_collaborators, public.event_collaborator_invitations to service_role;

-- events: el colaborador debe poder ver (no editar) el evento al que fue invitado.
drop policy events_member_select on public.events;
create policy events_member_select on public.events for select to authenticated using (
  status = 'published'
  or (select public.is_org_member(organization_id))
  or exists (select 1 from public.event_collaborators c where c.event_id = events.id and c.user_id = (select auth.uid()))
);

-- venues: idem, el colaborador necesita leer nombre/dirección/timezone del lugar de su evento.
drop policy venues_member_select on public.venues;
create policy venues_member_select on public.venues for select to authenticated using (
  (select public.is_org_member(organization_id))
  or exists (
    select 1 from public.event_collaborators c join public.events e on e.id = c.event_id
    where e.venue_id = venues.id and c.user_id = (select auth.uid())
  )
);

-- Entradas: lectura y escritura de tipos de entrada.
drop policy types_manager_write on public.ticket_types;
create policy types_manager_write on public.ticket_types for all to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)))
  with check ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));

-- Invitados: lectura de tickets emitidos y sus envíos.
drop policy tickets_manager_select on public.tickets;
create policy tickets_manager_select on public.tickets for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy ticket_deliveries_manager_select on public.ticket_deliveries;
create policy ticket_deliveries_manager_select on public.ticket_deliveries for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));

-- Entradas: ventas por evento (usadas en la pestaña Entradas y para reenviar el email).
drop policy orders_manager_select on public.orders;
create policy orders_manager_select on public.orders for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));

-- Mesas: sectores, mesas, beneficios, holds.
drop policy table_zones_manager_select on public.table_zones;
create policy table_zones_manager_select on public.table_zones for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy event_tables_manager_select on public.event_tables;
create policy event_tables_manager_select on public.event_tables for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy table_entitlement_templates_manager_select on public.table_entitlement_templates;
create policy table_entitlement_templates_manager_select on public.table_entitlement_templates for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy table_holds_manager_select on public.table_holds;
create policy table_holds_manager_select on public.table_holds for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy entitlements_manager_select on public.entitlements;
create policy entitlements_manager_select on public.entitlements for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));

-- Accesos: puertas, dispositivos, sesiones de scanner, actividad de ingreso.
drop policy access_gates_manager_select on public.access_gates;
create policy access_gates_manager_select on public.access_gates for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy access_gate_ticket_types_manager_select on public.access_gate_ticket_types;
create policy access_gate_ticket_types_manager_select on public.access_gate_ticket_types for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy scanner_device_authorizations_manager_select on public.scanner_device_authorizations;
create policy scanner_device_authorizations_manager_select on public.scanner_device_authorizations for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy scanner_sessions_manager_select on public.scanner_sessions;
create policy scanner_sessions_manager_select on public.scanner_sessions for select to authenticated
  using ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id)));
drop policy checkins_manager_select on public.checkins;
create policy checkins_manager_select on public.checkins for select to authenticated
  using (organization_id is not null and ((select public.can_manage_org(organization_id)) or (select public.can_manage_event(event_id))));

-- === RPCs: sumar la rama can_manage_event junto al chequeo can_manage_org existente ===

create or replace function public.create_table_zone(
  target_event uuid, target_name text, target_description text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare event_row public.events; new_zone_id uuid; next_sort_order integer;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 100
    or char_length(coalesce(target_description, '')) > 500 then
    raise exception 'INVALID_TABLE_ZONE' using errcode = 'P0001';
  end if;
  select coalesce(max(z.sort_order), -1) + 1 into next_sort_order
  from public.table_zones z where z.event_id = target_event;
  insert into public.table_zones (organization_id, event_id, name, description, sort_order)
  values (event_row.organization_id, event_row.id, trim(target_name), trim(coalesce(target_description, '')), next_sort_order)
  returning id into new_zone_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'table_zone.created', 'table_zone', new_zone_id,
    jsonb_build_object('event_id', event_row.id, 'name', trim(target_name)));
  return new_zone_id;
end;
$$;

create or replace function public.create_event_table(
  target_event uuid, target_zone uuid, target_name text, target_description text,
  target_capacity integer, target_base_price_amount bigint, target_currency char(3),
  target_service_fee_bps integer, target_access_gate uuid, target_benefits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events; zone_row public.table_zones; new_table_id uuid;
  next_sort_order integer; configured_capacity bigint; benefit jsonb; benefit_index integer := 0;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into zone_row from public.table_zones
  where id = target_zone and event_id = event_row.id and organization_id = event_row.organization_id and active
  for update;
  if not found then raise exception 'INVALID_TABLE_ZONE' using errcode = 'P0001'; end if;
  if target_access_gate is not null and not exists (
    select 1 from public.access_gates g
    where g.id = target_access_gate and g.event_id = event_row.id and g.organization_id = event_row.organization_id
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
    name, description, capacity, base_price_amount, currency, service_fee_bps, sort_order
  ) values (
    event_row.organization_id, event_row.id, zone_row.id, target_access_gate,
    trim(target_name), trim(coalesce(target_description, '')), target_capacity,
    target_base_price_amount, event_row.currency, target_service_fee_bps, next_sort_order
  ) returning id into new_table_id;
  for benefit in select value from jsonb_array_elements(target_benefits) loop
    insert into public.table_entitlement_templates (
      organization_id, event_id, event_table_id, entitlement_type, reference_id, name, quantity, metadata, sort_order
    ) values (
      event_row.organization_id, event_row.id, new_table_id,
      (benefit->>'entitlement_type')::public.entitlement_type,
      nullif(benefit->>'reference_id', '')::uuid,
      trim(benefit->>'name'), (benefit->>'quantity')::integer,
      coalesce(benefit->'metadata', '{}'::jsonb), benefit_index
    );
    benefit_index := benefit_index + 1;
  end loop;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'event_table.created', 'event_table', new_table_id,
    jsonb_build_object('event_id', event_row.id, 'name', trim(target_name), 'capacity', target_capacity, 'base_price_amount', target_base_price_amount));
  return new_table_id;
end;
$$;

create or replace function public.set_event_table_active(target_table uuid, target_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare table_row public.event_tables; event_row public.events; configured_capacity bigint;
begin
  select * into table_row from public.event_tables where id = target_table for update;
  if not found or auth.uid() is null or not (public.can_manage_org(table_row.organization_id) or public.can_manage_event(table_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into event_row from public.events where id = table_row.event_id for update;
  update public.table_holds set status = 'expired'
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
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (table_row.organization_id, auth.uid(),
    case when target_active then 'event_table.enabled' else 'event_table.disabled' end,
    'event_table', table_row.id, jsonb_build_object('active', target_active));
end;
$$;

create or replace function public.create_access_gate(
  target_event uuid, gate_name text, gate_description text, accepted_ticket_types uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare event_row public.events; created_gate_id uuid;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(gate_name)) not between 2 and 80
    or char_length(coalesce(gate_description, '')) > 240
    or coalesce(cardinality(accepted_ticket_types), 0) = 0 then
    raise exception 'INVALID_GATE' using errcode = 'P0001';
  end if;
  if (
    select count(distinct tt.id) from public.ticket_types tt
    where tt.event_id = target_event and tt.id = any(accepted_ticket_types)
  ) <> cardinality(accepted_ticket_types) then
    raise exception 'INVALID_GATE_TICKET_TYPES' using errcode = 'P0001';
  end if;
  insert into public.access_gates (organization_id, event_id, name, description)
  values (event_row.organization_id, event_row.id, trim(gate_name), trim(coalesce(gate_description, '')))
  returning id into created_gate_id;
  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select created_gate_id, tt.id, event_row.organization_id, event_row.id
  from public.ticket_types tt where tt.event_id = event_row.id and tt.id = any(accepted_ticket_types);
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'access.gate.created', 'access_gate', created_gate_id,
    jsonb_build_object('event_id', event_row.id, 'name', trim(gate_name), 'ticket_type_count', cardinality(accepted_ticket_types)));
  return created_gate_id;
end;
$$;

create or replace function public.update_access_gate(
  target_gate uuid, gate_name text, gate_description text, gate_active boolean, accepted_ticket_types uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare gate_row public.access_gates;
begin
  select * into gate_row from public.access_gates where id = target_gate for update;
  if not found or auth.uid() is null or not (public.can_manage_org(gate_row.organization_id) or public.can_manage_event(gate_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(gate_name)) not between 2 and 80
    or char_length(coalesce(gate_description, '')) > 240
    or coalesce(cardinality(accepted_ticket_types), 0) = 0 then
    raise exception 'INVALID_GATE' using errcode = 'P0001';
  end if;
  if (
    select count(distinct tt.id) from public.ticket_types tt
    where tt.event_id = gate_row.event_id and tt.id = any(accepted_ticket_types)
  ) <> cardinality(accepted_ticket_types) then
    raise exception 'INVALID_GATE_TICKET_TYPES' using errcode = 'P0001';
  end if;
  update public.access_gates
  set name = trim(gate_name), description = trim(coalesce(gate_description, '')), active = gate_active
  where id = gate_row.id;
  delete from public.access_gate_ticket_types where access_gate_id = gate_row.id;
  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select gate_row.id, tt.id, gate_row.organization_id, gate_row.event_id
  from public.ticket_types tt where tt.event_id = gate_row.event_id and tt.id = any(accepted_ticket_types);
  if not gate_active then
    update public.scanner_sessions set revoked_at = coalesce(revoked_at, now())
    where access_gate_id = gate_row.id and revoked_at is null;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (gate_row.organization_id, auth.uid(), 'access.gate.updated', 'access_gate', gate_row.id,
    jsonb_build_object('active', gate_active, 'ticket_type_count', cardinality(accepted_ticket_types)));
end;
$$;

create or replace function public.create_scanner_authorization(
  target_event uuid, target_gate uuid, device_label text, target_permission public.scanner_permission,
  target_pin text, target_code_expires_at timestamptz, target_session_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare event_row public.events; gate_row public.access_gates; created_id uuid; operational_end timestamptz;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into gate_row from public.access_gates
  where id = target_gate and event_id = event_row.id and organization_id = event_row.organization_id;
  if not found or not gate_row.active then
    raise exception 'GATE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  operational_end := coalesce(event_row.ends_at + interval '4 hours', event_row.starts_at + interval '16 hours');
  if event_row.status not in ('published', 'sold_out')
    or target_pin !~ '^[0-9]{6}$'
    or char_length(trim(device_label)) not between 2 and 80
    or target_code_expires_at <= now()
    or target_code_expires_at > now() + interval '1 hour'
    or target_session_expires_at <= now()
    or target_session_expires_at > operational_end
    or target_code_expires_at > target_session_expires_at then
    raise exception 'INVALID_DEVICE_AUTHORIZATION' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.scanner_device_authorizations a
    where a.pin_hash is not null and a.revoked_at is null and a.code_expires_at > now()
      and a.pin_hash = extensions.crypt(target_pin, a.pin_hash)
  ) then
    raise exception 'PIN_COLLISION' using errcode = 'P0001';
  end if;
  insert into public.scanner_device_authorizations (
    organization_id, event_id, access_gate_id, label, permission, pin_hash,
    code_expires_at, session_expires_at, created_by
  ) values (
    event_row.organization_id, event_row.id, gate_row.id, trim(device_label), target_permission,
    extensions.crypt(target_pin, extensions.gen_salt('bf', 10)),
    target_code_expires_at, target_session_expires_at, auth.uid()
  ) returning id into created_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'access.device_authorization.created',
    'scanner_device_authorization', created_id,
    jsonb_build_object('event_id', event_row.id, 'gate_id', gate_row.id, 'permission', target_permission));
  return created_id;
end;
$$;

create or replace function public.revoke_scanner_authorization(target_authorization uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare auth_row public.scanner_device_authorizations;
begin
  select * into auth_row from public.scanner_device_authorizations where id = target_authorization for update;
  if not found or auth.uid() is null or not (public.can_manage_org(auth_row.organization_id) or public.can_manage_event(auth_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.scanner_device_authorizations set revoked_at = coalesce(revoked_at, now()), pin_hash = null where id = auth_row.id;
  update public.scanner_sessions set revoked_at = coalesce(revoked_at, now())
  where authorization_id = auth_row.id and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (auth_row.organization_id, auth.uid(), 'access.device_authorization.revoked', 'scanner_device_authorization', auth_row.id);
end;
$$;

create or replace function public.revoke_scanner_session(target_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare session_row public.scanner_sessions;
begin
  select * into session_row from public.scanner_sessions where id = target_session for update;
  if not found or auth.uid() is null or not (public.can_manage_org(session_row.organization_id) or public.can_manage_event(session_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions set revoked_at = coalesce(revoked_at, now()) where id = session_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (session_row.organization_id, auth.uid(), 'access.scanner_session.revoked', 'scanner_session', session_row.id);
end;
$$;

create or replace function public.get_event_access_metrics(target_event uuid)
returns table (
  entries_today bigint, valid_scans_today bigint, duplicate_scans_today bigint,
  rejected_scans_today bigint, active_devices bigint
) language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events; venue_timezone text; local_day date;
begin
  select e.* into event_row from public.events e where e.id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select v.timezone into venue_timezone from public.venues v where v.id = event_row.venue_id;
  local_day := (now() at time zone venue_timezone)::date;
  return query
  select
    count(*) filter (where c.result = 'valid'),
    count(*) filter (where c.result = 'valid'),
    count(*) filter (where c.result = 'already_used'),
    count(*) filter (where c.result not in ('valid', 'already_used')),
    (
      select count(*) from public.scanner_sessions s
      join public.scanner_device_authorizations a on a.id = s.authorization_id
      where s.event_id = target_event and s.revoked_at is null and s.expires_at > now() and a.revoked_at is null
    )
  from public.checkins c
  where c.event_id = target_event and (c.scanned_at at time zone venue_timezone)::date = local_day;
end;
$$;

create or replace function public.get_event_recent_checkins(target_event uuid, result_limit integer default 30)
returns table (
  checkin_id uuid, result public.checkin_result, gate_name text, device_label text,
  ticket_type_name text, holder_name text, short_code text, entry_number integer,
  override boolean, source public.checkin_source, scanned_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare target_organization uuid; target_event_row public.events;
begin
  select e.* into target_event_row from public.events e where e.id = target_event;
  target_organization := target_event_row.organization_id;
  if target_organization is null or auth.uid() is null
    or not (public.can_manage_org(target_organization) or public.can_manage_event(target_event)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select c.id, c.result, g.name, a.label,
    coalesce(tt.name, et.name),
    case when t.id is null then null else trim(t.holder_first_name || ' ' || left(t.holder_last_name, 1) || '.') end,
    t.short_code, c.entry_number, c.override, c.source, c.scanned_at
  from public.checkins c
  left join public.access_gates g on g.id = c.access_gate_id
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  left join public.scanner_device_authorizations a on a.id = s.authorization_id
  left join public.tickets t on t.id = c.ticket_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.event_tables et on et.id = t.event_table_id
  where c.event_id = target_event
  order by c.scanned_at desc
  limit least(greatest(coalesce(result_limit, 30), 1), 100);
end;
$$;

create or replace function public.get_event_ticket_metrics(target_event uuid)
returns table (tickets_issued bigint, paid_orders bigint, delivery_failures bigint)
language plpgsql stable security definer set search_path = '' as $$
declare target_organization uuid;
begin
  select organization_id into target_organization from public.events where id = target_event;
  if target_organization is null or auth.uid() is null
    or not (public.can_manage_org(target_organization) or public.can_manage_event(target_event)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    (select count(*) from public.tickets t where t.event_id = target_event and t.ticket_type_id is not null),
    (select count(*) from public.orders o where o.event_id = target_event and o.status = 'paid'),
    (select count(*) from public.ticket_deliveries d where d.event_id = target_event and d.status = 'failed');
end;
$$;

create or replace function public.get_event_table_metrics(target_event uuid)
returns table (sold_tables bigint, total_tables bigint, table_revenue bigint, held_tables bigint, currency char(3))
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    (select count(distinct h.event_table_id) from public.table_holds h
      where h.event_id = target_event and h.status in ('consumed', 'refund_review')),
    (select count(*) from public.event_tables et where et.event_id = target_event and et.active),
    (select coalesce(sum(i.line_total_amount), 0)::bigint
      from public.order_items i join public.orders o on o.id = i.order_id
      where o.event_id = target_event and o.status = 'paid' and i.item_type = 'table'),
    (select count(distinct h.event_table_id) from public.table_holds h
      where h.event_id = target_event and h.status = 'active' and h.expires_at > now()),
    event_row.currency;
end;
$$;

create or replace function public.get_event_attribution_metrics(target_event uuid)
returns table (promoter_ticket_revenue bigint, direct_ticket_revenue bigint, promoter_tickets bigint)
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is not null), 0)::bigint,
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is null), 0)::bigint,
    coalesce(sum(i.quantity) filter (where o.event_promoter_id is not null), 0)::bigint
  from public.orders o join public.order_items i on i.order_id = o.id
  where o.event_id = target_event and o.status = 'paid';
end;
$$;

create or replace function public.get_event_table_attribution_metrics(target_event uuid)
returns table (promoter_table_revenue bigint, direct_table_revenue bigint, promoter_tables bigint)
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is not null), 0)::bigint,
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is null), 0)::bigint,
    count(i.id) filter (where o.event_promoter_id is not null)::bigint
  from public.orders o join public.order_items i on i.order_id = o.id and i.item_type = 'table'
  where o.event_id = target_event and o.status = 'paid';
end;
$$;

create or replace function public.get_event_ticket_sales(target_event uuid)
returns table (
  order_id uuid, order_public_id text, buyer_name text, buyer_email text,
  order_status public.order_status, total_amount bigint, currency char(3),
  ticket_count bigint, ticket_names text, delivery_status public.ticket_delivery_status, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare target_organization uuid;
begin
  select organization_id into target_organization from public.events where id = target_event;
  if target_organization is null or auth.uid() is null
    or not (public.can_manage_org(target_organization) or public.can_manage_event(target_event)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    o.id, o.public_id, trim(c.first_name || ' ' || c.last_name), c.email, o.status, o.total_amount, o.currency,
    count(t.id), coalesce(string_agg(tt.name, ', ' order by tt.sort_order, t.unit_index), ''), d.status, o.created_at
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.tickets t on t.order_id = o.id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.ticket_deliveries d on d.order_id = o.id and d.kind = 'tickets' and d.channel = 'email'
  where o.event_id = target_event and o.status in ('paid', 'refunded')
  group by o.id, c.first_name, c.last_name, c.email, d.status
  order by o.created_at desc
  limit 50;
end;
$$;

create or replace function public.create_courtesy_checkout(
  target_event uuid, target_ticket_type uuid, buyer_first_name text, buyer_last_name text,
  buyer_email text, quantity integer
) returns table (order_public_id text) language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events; type_row public.ticket_types; customer_id uuid; order_id uuid;
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
  expiry timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = target_event;
  if not found or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if quantity < 1 or quantity > 10 then raise exception 'INVALID_QUANTITY' using errcode = 'P0001'; end if;
  if char_length(trim(buyer_first_name)) < 1
    or char_length(trim(buyer_last_name)) < 1
    or buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_BUYER' using errcode = 'P0001';
  end if;
  select * into type_row from public.ticket_types
  where id = target_ticket_type and event_id = target_event and active for update;
  if not found then raise exception 'INVALID_TICKET_TYPE' using errcode = 'P0001'; end if;
  insert into public.customers (organization_id, first_name, last_name, email, phone, document)
  values (event_row.organization_id, trim(buyer_first_name), trim(buyer_last_name), lower(trim(buyer_email)), null, null)
  on conflict (organization_id, lower(email)) do update
  set first_name = excluded.first_name, last_name = excluded.last_name
  returning id into customer_id;
  insert into public.orders (
    public_id, organization_id, event_id, customer_id,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id, 0, 0, 0, event_row.currency, expiry
  ) returning id into order_id;
  insert into public.order_items (
    organization_id, order_id, item_type, ticket_type_id, item_name,
    unit_price_amount, quantity, line_total_amount
  ) values (
    event_row.organization_id, order_id, 'ticket', target_ticket_type, type_row.name, 0, quantity, 0
  );
  return query select generated_public_id;
end;
$$;

-- === Invitación de colaboradores ===

create or replace function public.create_event_collaborator_invitation(target_event uuid, target_email text, target_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events; normalized_email text := lower(trim(target_email));
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  insert into public.event_collaborator_invitations (event_id, organization_id, email, token_hash, invited_by)
  values (event_row.id, event_row.organization_id, normalized_email, target_token_hash, auth.uid());
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, auth.uid(), 'event_collaborator.invited', 'event', event_row.id,
    jsonb_build_object('email', normalized_email));
end;
$$;
revoke all on function public.create_event_collaborator_invitation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_event_collaborator_invitation(uuid, text, text) to authenticated;

create or replace function public.accept_event_collaborator_invitation(raw_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_row public.event_collaborator_invitations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select * into invitation_row from public.event_collaborator_invitations
  where token_hash = raw_token_hash for update;
  if not found or invitation_row.accepted_at is not null or invitation_row.expires_at <= now() then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  insert into public.event_collaborators (event_id, organization_id, user_id, invited_by)
  values (invitation_row.event_id, invitation_row.organization_id, auth.uid(), invitation_row.invited_by)
  on conflict (event_id, user_id) do nothing;
  update public.event_collaborator_invitations set accepted_at = now() where id = invitation_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (invitation_row.organization_id, auth.uid(), 'event_collaborator.accepted', 'event', invitation_row.event_id);
  return invitation_row.event_id;
end;
$$;
revoke all on function public.accept_event_collaborator_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_event_collaborator_invitation(text) to authenticated;

create or replace function public.remove_event_collaborator(target_event uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.event_collaborators where event_id = target_event and user_id = target_user;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event_collaborator.removed', 'event', target_event);
end;
$$;
revoke all on function public.remove_event_collaborator(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_event_collaborator(uuid, uuid) to authenticated;

-- lista de colaboradores + su email (para mostrar en la UI de gestión, solo managers)
create or replace function public.get_event_collaborators(target_event uuid)
returns table (collaborator_id uuid, user_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare event_row public.events;
begin
  select e.* into event_row from public.events e where e.id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select c.id, c.user_id, u.email::text, c.created_at
  from public.event_collaborators c join auth.users u on u.id = c.user_id
  where c.event_id = target_event
  order by c.created_at desc;
end;
$$;
revoke all on function public.get_event_collaborators(uuid) from public, anon, authenticated;
grant execute on function public.get_event_collaborators(uuid) to authenticated;
