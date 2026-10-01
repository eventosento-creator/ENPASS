-- Hoy el PIN de caja/taquilla (pos_device_authorizations) y de scanner
-- (scanner_device_authorizations) es de un solo uso: al activarse, el pin_hash se borra y
-- (en POS) el status pasa a 'active' para siempre — así que si el dispositivo cierra sesión
-- (logout, se queda sin batería, se borra el caché) hay que generarle un PIN nuevo desde cero.
-- Pedido del dueño: el mismo PIN tiene que servir para volver a abrir la MISMA caja/puerta las
-- veces que haga falta durante el evento, hasta que el productor lo revoque a mano. El PIN
-- sigue atado al evento (no cruza eventos), como ya estaba.

-- Relajar los invariantes que ataban activation_count a {0,1} y a que pin_hash se borre al
-- activar — ahora activation_count es un contador libre (cuántas veces se reabrió esta caja)
-- y pin_hash se mantiene vivo mientras la autorización no esté revocada.
alter table public.scanner_device_authorizations drop constraint scanner_device_authorizations_activation_count_check;
alter table public.scanner_device_authorizations add constraint scanner_device_authorizations_activation_count_check check (activation_count >= 0);
alter table public.scanner_device_authorizations drop constraint scanner_device_authorizations_check1;
alter table public.scanner_device_authorizations add constraint scanner_device_authorizations_check1
  check ((activation_count = 0 and activated_at is null) or (activation_count > 0 and activated_at is not null));
alter table public.scanner_device_authorizations drop constraint scanner_device_authorizations_check2;
alter table public.scanner_device_authorizations add constraint scanner_device_authorizations_check2
  check ((activation_count = 0 and pin_hash is not null) or activation_count > 0);

alter table public.pos_device_authorizations drop constraint pos_device_authorizations_activation_count_check;
alter table public.pos_device_authorizations add constraint pos_device_authorizations_activation_count_check check (activation_count >= 0);
alter table public.pos_device_authorizations drop constraint pos_device_authorizations_check1;
alter table public.pos_device_authorizations add constraint pos_device_authorizations_check1 check (
  (status = 'pending' and activation_count = 0 and activated_at is null and pin_hash is not null and revoked_at is null)
  or (status = 'active' and activation_count > 0 and activated_at is not null and pin_hash is not null and revoked_at is null)
  or (status = 'revoked' and revoked_at is not null and pin_hash is null)
);

-- La colisión de PIN ya no puede limitarse a "mientras el código no se activó" (antes el
-- pin_hash desaparecía al activar, ahora persiste mientras no esté revocado).
create or replace function public.create_scanner_authorization(
  target_event uuid,
  target_gate uuid,
  device_label text,
  target_permission public.scanner_permission,
  target_pin text,
  target_code_expires_at timestamptz,
  target_session_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  gate_row public.access_gates;
  created_id uuid;
  operational_end timestamptz;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
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
    where a.pin_hash is not null and a.revoked_at is null
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
  values (
    event_row.organization_id, auth.uid(), 'access.device_authorization.created',
    'scanner_device_authorization', created_id,
    jsonb_build_object('event_id', event_row.id, 'gate_id', gate_row.id, 'permission', target_permission)
  );
  return created_id;
end;
$$;

-- Ahora puede reactivar un código ya usado antes (activation_count > 0): solo la PRIMERA
-- activación respeta la ventana corta de code_expires_at (pensada para que el productor
-- entregue el PIN y lo activen pronto); de ahí en más sirve para reabrir la misma caja hasta
-- session_expires_at (fin operativo del evento) o hasta que se revoque a mano. Cada
-- reactivación cierra cualquier sesión viva anterior de esa misma autorización, para que no
-- queden dos sesiones activas bajo el mismo PIN.
create or replace function public.activate_scanner_device(
  target_pin text,
  target_session_hash text,
  target_fingerprint_hash text
)
returns table (
  activation_status text,
  scanner_session_id uuid,
  event_id uuid,
  event_name text,
  gate_id uuid,
  gate_name text,
  permission public.scanner_permission,
  event_timezone text,
  expires_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_row public.scanner_activation_rate_limits;
  authorization_row public.scanner_device_authorizations;
  selected_event public.events;
  selected_venue public.venues;
  selected_gate public.access_gates;
  created_session_id uuid;
  next_attempts integer;
  blocked_until_value timestamptz;
begin
  if target_pin !~ '^[0-9]{6}$'
    or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text,
      null::uuid, null::text, null::public.scanner_permission, null::text, null::timestamptz, 0;
    return;
  end if;

  delete from public.scanner_activation_rate_limits
  where updated_at < now() - interval '24 hours';

  insert into public.scanner_activation_rate_limits (fingerprint_hash)
  values (target_fingerprint_hash)
  on conflict (fingerprint_hash) do nothing;

  select * into rate_row from public.scanner_activation_rate_limits
  where fingerprint_hash = target_fingerprint_hash
  for update;

  if rate_row.blocked_until is not null and rate_row.blocked_until > now() then
    return query select 'rate_limited'::text, null::uuid, null::uuid, null::text,
      null::uuid, null::text, null::public.scanner_permission, null::text, null::timestamptz,
      greatest(1, ceil(extract(epoch from (rate_row.blocked_until - now())))::integer);
    return;
  end if;

  if rate_row.window_started_at <= now() - interval '15 minutes' then
    update public.scanner_activation_rate_limits
    set window_started_at = now(), failed_attempts = 0, blocked_until = null, updated_at = now()
    where fingerprint_hash = target_fingerprint_hash
    returning * into rate_row;
  end if;

  select a.* into authorization_row
  from public.scanner_device_authorizations a
  where a.pin_hash is not null
    and a.revoked_at is null
    and (
      (a.activation_count = 0 and a.code_expires_at > now())
      or a.activation_count > 0
    )
    and a.pin_hash = extensions.crypt(target_pin, a.pin_hash)
  order by a.created_at desc
  limit 1
  for update of a;

  if not found then
    next_attempts := rate_row.failed_attempts + 1;
    blocked_until_value := case when next_attempts >= 5 then now() + interval '15 minutes' else null end;
    update public.scanner_activation_rate_limits
    set failed_attempts = next_attempts, blocked_until = blocked_until_value, updated_at = now()
    where fingerprint_hash = target_fingerprint_hash;
    return query select
      case when blocked_until_value is null then 'invalid' else 'rate_limited' end::text,
      null::uuid, null::uuid, null::text, null::uuid, null::text,
      null::public.scanner_permission, null::text, null::timestamptz,
      case when blocked_until_value is null then 0 else 900 end;
    return;
  end if;

  select * into selected_event from public.events where id = authorization_row.event_id;
  select * into selected_venue from public.venues where id = selected_event.venue_id;
  select * into selected_gate from public.access_gates where id = authorization_row.access_gate_id;
  if authorization_row.session_expires_at <= now()
    or selected_event.status not in ('published', 'sold_out')
    or not selected_gate.active then
    update public.scanner_device_authorizations
    set revoked_at = coalesce(revoked_at, now()), pin_hash = null
    where id = authorization_row.id;
    return query select 'expired'::text, null::uuid, null::uuid, null::text,
      null::uuid, null::text, null::public.scanner_permission, null::text, null::timestamptz, 0;
    return;
  end if;

  update public.scanner_sessions set revoked_at = coalesce(revoked_at, now())
  where authorization_id = authorization_row.id and revoked_at is null;

  insert into public.scanner_sessions (
    authorization_id, organization_id, event_id, access_gate_id,
    permission, session_token_hash, expires_at
  ) values (
    authorization_row.id, authorization_row.organization_id, authorization_row.event_id,
    authorization_row.access_gate_id, authorization_row.permission,
    target_session_hash, authorization_row.session_expires_at
  ) returning id into created_session_id;

  update public.scanner_device_authorizations
  set activation_count = activation_count + 1, activated_at = coalesce(activated_at, now())
  where id = authorization_row.id;
  update public.scanner_activation_rate_limits
  set failed_attempts = 0, window_started_at = now(), blocked_until = null, updated_at = now()
  where fingerprint_hash = target_fingerprint_hash;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    authorization_row.organization_id, 'access.scanner_session.activated',
    'scanner_session', created_session_id,
    jsonb_build_object('authorization_id', authorization_row.id, 'gate_id', selected_gate.id,
      'reactivation', authorization_row.activation_count > 0)
  );

  return query select 'ok'::text, created_session_id, selected_event.id, selected_event.name,
    selected_gate.id, selected_gate.name, authorization_row.permission,
    selected_venue.timezone, authorization_row.session_expires_at, 0;
end;
$$;

-- Mismo motivo que arriba para el PIN de caja/taquilla.
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
    where a.pin_hash is not null and a.revoked_at is null
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
  where a.pin_hash is not null and a.revoked_at is null
    and (
      (a.status = 'pending' and a.code_expires_at > now())
      or a.status = 'active'
    )
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
  update public.pos_device_sessions set revoked_at = coalesce(revoked_at, now())
  where authorization_id = auth_row.id and revoked_at is null;
  insert into public.pos_device_sessions (
    authorization_id, organization_id, event_id, sales_location_id, session_token_hash, expires_at
  ) values (
    auth_row.id, auth_row.organization_id, auth_row.event_id, auth_row.sales_location_id,
    target_session_hash, auth_row.session_expires_at
  ) returning id into created_session;
  update public.pos_device_authorizations set status = 'active', activation_count = activation_count + 1,
    activated_at = coalesce(activated_at, now()) where id = auth_row.id;
  update public.pos_activation_rate_limits set failed_attempts = 0, blocked_until = null,
    window_started_at = now(), updated_at = now() where fingerprint_hash = target_fingerprint_hash;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (auth_row.organization_id, 'pos_device.activated', 'pos_device_session', created_session,
    jsonb_build_object('device_id', auth_row.id, 'sales_location_id', auth_row.sales_location_id,
      'reactivation', auth_row.activation_count > 0));
  return query select 'ok', created_session, auth_row.id, selected_event.id, selected_event.name,
    selected_location.id, selected_location.name, auth_row.name, selected_venue.timezone,
    auth_row.session_expires_at, 0;
end;
$$;
