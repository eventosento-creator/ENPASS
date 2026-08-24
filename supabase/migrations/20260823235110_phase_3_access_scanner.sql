create type public.scanner_permission as enum ('scanner', 'supervisor');
create type public.checkin_result as enum (
  'valid',
  'already_used',
  'invalid',
  'wrong_event',
  'wrong_gate',
  'too_early',
  'too_late',
  'cancelled',
  'refunded',
  'expired',
  'device_not_authorized',
  'rate_limited'
);
create type public.checkin_source as enum ('qr', 'manual');
create type public.checkin_override_reason as enum ('wrong_gate', 'outside_window', 'manual_code', 'supervisor_exception');

create table public.access_gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id, organization_id)
);

create unique index access_gates_event_name_unique
  on public.access_gates (event_id, lower(name));
create index access_gates_organization_event_idx
  on public.access_gates (organization_id, event_id);

alter table public.ticket_types
  add constraint ticket_types_id_event_organization_unique
  unique (id, event_id, organization_id);

create table public.access_gate_ticket_types (
  access_gate_id uuid not null,
  ticket_type_id uuid not null,
  organization_id uuid not null,
  event_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (access_gate_id, ticket_type_id),
  foreign key (access_gate_id, event_id, organization_id)
    references public.access_gates(id, event_id, organization_id) on delete cascade,
  foreign key (ticket_type_id, event_id, organization_id)
    references public.ticket_types(id, event_id, organization_id) on delete cascade
);

create index access_gate_ticket_types_ticket_type_idx
  on public.access_gate_ticket_types (ticket_type_id, access_gate_id);
create index access_gate_ticket_types_organization_event_idx
  on public.access_gate_ticket_types (organization_id, event_id);

create table public.scanner_device_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_gate_id uuid not null references public.access_gates(id) on delete restrict,
  label text not null check (char_length(trim(label)) between 2 and 80),
  permission public.scanner_permission not null default 'scanner',
  pin_hash text,
  code_expires_at timestamptz not null,
  session_expires_at timestamptz not null,
  activation_count integer not null default 0 check (activation_count between 0 and 1),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code_expires_at <= session_expires_at),
  check ((activation_count = 0 and activated_at is null) or (activation_count = 1 and activated_at is not null)),
  check ((activation_count = 0 and pin_hash is not null) or activation_count = 1)
);

alter table public.scanner_device_authorizations
  add constraint scanner_device_authorizations_gate_scope_fkey
  foreign key (access_gate_id, event_id, organization_id)
  references public.access_gates(id, event_id, organization_id) on delete restrict;

create index scanner_device_authorizations_event_idx
  on public.scanner_device_authorizations (organization_id, event_id, created_at desc);
create index scanner_device_authorizations_gate_idx
  on public.scanner_device_authorizations (access_gate_id);
create index scanner_device_authorizations_pending_idx
  on public.scanner_device_authorizations (code_expires_at)
  where pin_hash is not null and revoked_at is null;

create table public.scanner_sessions (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references public.scanner_device_authorizations(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  access_gate_id uuid not null references public.access_gates(id) on delete restrict,
  permission public.scanner_permission not null,
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  scan_window_started_at timestamptz not null default now(),
  scan_attempts integer not null default 0 check (scan_attempts >= 0),
  manual_window_started_at timestamptz not null default now(),
  manual_attempts integer not null default 0 check (manual_attempts >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scanner_sessions
  add constraint scanner_sessions_gate_scope_fkey
  foreign key (access_gate_id, event_id, organization_id)
  references public.access_gates(id, event_id, organization_id) on delete restrict;

create index scanner_sessions_event_active_idx
  on public.scanner_sessions (organization_id, event_id, expires_at)
  where revoked_at is null;
create index scanner_sessions_authorization_idx
  on public.scanner_sessions (authorization_id);
create index scanner_sessions_gate_idx
  on public.scanner_sessions (access_gate_id);

create table public.scanner_activation_rate_limits (
  fingerprint_hash text primary key check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete restrict,
  access_gate_id uuid references public.access_gates(id) on delete restrict,
  scanner_session_id uuid references public.scanner_sessions(id) on delete restrict,
  result public.checkin_result not null,
  source public.checkin_source not null default 'qr',
  entry_number integer check (entry_number is null or entry_number > 0),
  idempotency_key uuid not null unique,
  override boolean not null default false,
  override_by_scanner_session_id uuid references public.scanner_sessions(id) on delete restrict,
  override_of_checkin_id uuid references public.checkins(id) on delete restrict,
  override_reason public.checkin_override_reason,
  scanned_at timestamptz not null default now(),
  check (
    (result in ('invalid', 'device_not_authorized'))
    or (organization_id is not null and event_id is not null and ticket_id is not null)
  ),
  check ((result = 'valid' and entry_number is not null) or (result <> 'valid' and entry_number is null)),
  check (
    (override and override_by_scanner_session_id is not null and override_reason is not null)
    or (not override and override_by_scanner_session_id is null and override_reason is null and override_of_checkin_id is null)
  )
);

create unique index checkins_override_once_unique
  on public.checkins (override_of_checkin_id)
  where override_of_checkin_id is not null;
create index checkins_event_scanned_idx
  on public.checkins (organization_id, event_id, scanned_at desc);
create index checkins_ticket_valid_idx
  on public.checkins (ticket_id, scanned_at)
  where result = 'valid';
create index checkins_gate_scanned_idx
  on public.checkins (access_gate_id, scanned_at desc);
create index checkins_session_scanned_idx
  on public.checkins (scanner_session_id, scanned_at desc);

create trigger access_gates_touch before update on public.access_gates
for each row execute function public.touch_updated_at();
create trigger scanner_device_authorizations_touch before update on public.scanner_device_authorizations
for each row execute function public.touch_updated_at();

alter table public.access_gates enable row level security;
alter table public.access_gate_ticket_types enable row level security;
alter table public.scanner_device_authorizations enable row level security;
alter table public.scanner_sessions enable row level security;
alter table public.scanner_activation_rate_limits enable row level security;
alter table public.checkins enable row level security;

create policy access_gates_manager_select on public.access_gates
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy access_gate_ticket_types_manager_select on public.access_gate_ticket_types
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy scanner_device_authorizations_manager_select on public.scanner_device_authorizations
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy scanner_sessions_manager_select on public.scanner_sessions
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy checkins_manager_select on public.checkins
for select to authenticated
using (organization_id is not null and (select public.can_manage_org(organization_id)));

revoke all on table public.access_gates, public.access_gate_ticket_types,
  public.scanner_device_authorizations, public.scanner_sessions,
  public.scanner_activation_rate_limits, public.checkins from anon, authenticated;
grant select on table public.access_gates, public.access_gate_ticket_types, public.checkins to authenticated;
grant select (
  id, organization_id, event_id, access_gate_id, label, permission,
  code_expires_at, session_expires_at, activation_count, activated_at,
  revoked_at, created_by, created_at, updated_at
) on public.scanner_device_authorizations to authenticated;
grant select (
  id, authorization_id, organization_id, event_id, access_gate_id,
  permission, expires_at, last_seen_at, revoked_at, created_at
) on public.scanner_sessions to authenticated;

create function public.create_access_gate(
  target_event uuid,
  gate_name text,
  gate_description text,
  accepted_ticket_types uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  created_gate_id uuid;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(gate_name)) not between 2 and 80
    or char_length(coalesce(gate_description, '')) > 240
    or coalesce(cardinality(accepted_ticket_types), 0) = 0 then
    raise exception 'INVALID_GATE' using errcode = 'P0001';
  end if;
  if (
    select count(distinct tt.id)
    from public.ticket_types tt
    where tt.event_id = target_event and tt.id = any(accepted_ticket_types)
  ) <> cardinality(accepted_ticket_types) then
    raise exception 'INVALID_GATE_TICKET_TYPES' using errcode = 'P0001';
  end if;

  insert into public.access_gates (organization_id, event_id, name, description)
  values (event_row.organization_id, event_row.id, trim(gate_name), trim(coalesce(gate_description, '')))
  returning id into created_gate_id;

  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select created_gate_id, tt.id, event_row.organization_id, event_row.id
  from public.ticket_types tt
  where tt.event_id = event_row.id and tt.id = any(accepted_ticket_types);

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    event_row.organization_id, auth.uid(), 'access.gate.created', 'access_gate', created_gate_id,
    jsonb_build_object('event_id', event_row.id, 'name', trim(gate_name), 'ticket_type_count', cardinality(accepted_ticket_types))
  );
  return created_gate_id;
end;
$$;

create function public.update_access_gate(
  target_gate uuid,
  gate_name text,
  gate_description text,
  gate_active boolean,
  accepted_ticket_types uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gate_row public.access_gates;
begin
  select * into gate_row from public.access_gates where id = target_gate for update;
  if not found or auth.uid() is null or not public.can_manage_org(gate_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(gate_name)) not between 2 and 80
    or char_length(coalesce(gate_description, '')) > 240
    or coalesce(cardinality(accepted_ticket_types), 0) = 0 then
    raise exception 'INVALID_GATE' using errcode = 'P0001';
  end if;
  if (
    select count(distinct tt.id)
    from public.ticket_types tt
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
  from public.ticket_types tt
  where tt.event_id = gate_row.event_id and tt.id = any(accepted_ticket_types);

  if not gate_active then
    update public.scanner_sessions set revoked_at = coalesce(revoked_at, now())
    where access_gate_id = gate_row.id and revoked_at is null;
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    gate_row.organization_id, auth.uid(), 'access.gate.updated', 'access_gate', gate_row.id,
    jsonb_build_object('active', gate_active, 'ticket_type_count', cardinality(accepted_ticket_types))
  );
end;
$$;

create function public.create_scanner_authorization(
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
  values (
    event_row.organization_id, auth.uid(), 'access.device_authorization.created',
    'scanner_device_authorization', created_id,
    jsonb_build_object('event_id', event_row.id, 'gate_id', gate_row.id, 'permission', target_permission)
  );
  return created_id;
end;
$$;

create function public.revoke_scanner_authorization(target_authorization uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_row public.scanner_device_authorizations;
begin
  select * into auth_row from public.scanner_device_authorizations
  where id = target_authorization for update;
  if not found or auth.uid() is null or not public.can_manage_org(auth_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.scanner_device_authorizations
  set revoked_at = coalesce(revoked_at, now()), pin_hash = null
  where id = auth_row.id;
  update public.scanner_sessions set revoked_at = coalesce(revoked_at, now())
  where authorization_id = auth_row.id and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (auth_row.organization_id, auth.uid(), 'access.device_authorization.revoked', 'scanner_device_authorization', auth_row.id);
end;
$$;

create function public.activate_scanner_device(
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
    and a.activation_count = 0
    and a.code_expires_at > now()
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

  insert into public.scanner_sessions (
    authorization_id, organization_id, event_id, access_gate_id,
    permission, session_token_hash, expires_at
  ) values (
    authorization_row.id, authorization_row.organization_id, authorization_row.event_id,
    authorization_row.access_gate_id, authorization_row.permission,
    target_session_hash, authorization_row.session_expires_at
  ) returning id into created_session_id;

  update public.scanner_device_authorizations
  set activation_count = 1, activated_at = now(), pin_hash = null
  where id = authorization_row.id;
  update public.scanner_activation_rate_limits
  set failed_attempts = 0, window_started_at = now(), blocked_until = null, updated_at = now()
  where fingerprint_hash = target_fingerprint_hash;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    authorization_row.organization_id, 'access.scanner_session.activated',
    'scanner_session', created_session_id,
    jsonb_build_object('authorization_id', authorization_row.id, 'gate_id', selected_gate.id)
  );

  return query select 'ok'::text, created_session_id, selected_event.id, selected_event.name,
    selected_gate.id, selected_gate.name, authorization_row.permission,
    selected_venue.timezone, authorization_row.session_expires_at, 0;
end;
$$;

create function public.get_scanner_session(target_session_hash text)
returns table (
  scanner_session_id uuid,
  event_id uuid,
  event_name text,
  gate_id uuid,
  gate_name text,
  permission public.scanner_permission,
  event_timezone text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  selected_event public.events;
  selected_venue public.venues;
  selected_gate public.access_gates;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then return; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id;
  select * into selected_event from public.events where id = session_row.event_id;
  select * into selected_venue from public.venues where id = selected_event.venue_id;
  select * into selected_gate from public.access_gates where id = session_row.access_gate_id;
  if session_row.revoked_at is not null
    or session_row.expires_at <= now()
    or authorization_row.revoked_at is not null
    or selected_event.status not in ('published', 'sold_out')
    or not selected_gate.active then
    return;
  end if;
  update public.scanner_sessions set last_seen_at = now() where id = session_row.id;
  return query select session_row.id, selected_event.id, selected_event.name,
    selected_gate.id, selected_gate.name, session_row.permission, selected_venue.timezone,
    session_row.expires_at;
end;
$$;

create function public.revoke_scanner_session(target_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
begin
  select * into session_row from public.scanner_sessions where id = target_session for update;
  if not found or auth.uid() is null or not public.can_manage_org(session_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions set revoked_at = coalesce(revoked_at, now()) where id = session_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (session_row.organization_id, auth.uid(), 'access.scanner_session.revoked', 'scanner_session', session_row.id);
end;
$$;

create function public.revoke_current_scanner_session(target_session_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.scanner_sessions
  set revoked_at = coalesce(revoked_at, now())
  where session_token_hash = target_session_hash;
$$;

create function public.check_in_ticket(
  target_session_hash text,
  target_qr_hash text,
  target_idempotency_key uuid
)
returns table (
  result public.checkin_result,
  checkin_id uuid,
  ticket_id uuid,
  holder_name text,
  ticket_type_name text,
  sector text,
  short_code text,
  used_entries integer,
  max_entries integer,
  first_used_at timestamptz,
  first_used_gate_name text,
  valid_from timestamptz,
  valid_until timestamptz,
  suggested_gate_name text,
  scanned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_now timestamptz := clock_timestamp();
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  event_row public.events;
  gate_row public.access_gates;
  ticket_row public.tickets;
  prior_checkin public.checkins;
  outcome public.checkin_result := 'device_not_authorized'::public.checkin_result;
  created_checkin_id uuid;
  entry_number_value integer;
  ticket_type_name_value text;
  holder_name_value text;
  first_used_value timestamptz;
  first_used_gate_value text;
  suggested_gate_value text;
  session_is_valid boolean := false;
  ticket_is_found boolean := false;
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;

  select c.* into prior_checkin
  from public.checkins c
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  where c.idempotency_key = target_idempotency_key
    and (s.session_token_hash = target_session_hash or c.scanner_session_id is null)
  limit 1;
  if found then
    if prior_checkin.ticket_id is not null then
      select * into ticket_row from public.tickets where id = prior_checkin.ticket_id;
      select tt.name into ticket_type_name_value from public.ticket_types tt where tt.id = ticket_row.ticket_type_id;
      holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
      select c.scanned_at, g.name into first_used_value, first_used_gate_value
      from public.checkins c
      left join public.access_gates g on g.id = c.access_gate_id
      where c.ticket_id = ticket_row.id and c.result = 'valid'
      order by c.scanned_at
      limit 1;
      if prior_checkin.result = 'wrong_gate' then
        select g.name into suggested_gate_value
        from public.access_gate_ticket_types rule
        join public.access_gates g on g.id = rule.access_gate_id
        where rule.ticket_type_id = ticket_row.ticket_type_id
          and rule.event_id = prior_checkin.event_id
          and g.active
        order by g.name
        limit 1;
      end if;
    end if;
    return query select prior_checkin.result, prior_checkin.id, prior_checkin.ticket_id,
      case when prior_checkin.result in ('valid', 'already_used') then holder_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
      case when prior_checkin.result in ('valid', 'already_used') then ticket_row.short_code else null end,
      ticket_row.used_entries, ticket_row.max_entries, first_used_value, first_used_gate_value,
      ticket_row.valid_from, ticket_row.valid_until, suggested_gate_value, prior_checkin.scanned_at;
    return;
  end if;

  if target_session_hash ~ '^[0-9a-f]{64}$' then
    select * into session_row from public.scanner_sessions
    where session_token_hash = target_session_hash
    for update;
    if found then
      select * into authorization_row from public.scanner_device_authorizations
      where id = session_row.authorization_id for update;
      select * into event_row from public.events where id = session_row.event_id;
      select * into gate_row from public.access_gates where id = session_row.access_gate_id;
      session_is_valid := authorization_row.id is not null
        and session_row.revoked_at is null
        and session_row.expires_at > effective_now
        and authorization_row.revoked_at is null
        and event_row.status in ('published', 'sold_out')
        and gate_row.active;
    end if;
  end if;

  if not session_is_valid then
    outcome := 'device_not_authorized';
  else
    update public.scanner_sessions
    set last_seen_at = effective_now,
        scan_window_started_at = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then effective_now
          else scan_window_started_at
        end,
        scan_attempts = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then 1
          else scan_attempts + 1
        end
    where id = session_row.id
    returning * into session_row;

    if session_row.scan_attempts > 60 then
      return query select 'rate_limited'::public.checkin_result, null::uuid, null::uuid,
        null::text, null::text, null::text, null::text, null::integer, null::integer,
        null::timestamptz, null::text, null::timestamptz, null::timestamptz,
        null::text, effective_now;
      return;
    end if;

    if target_qr_hash !~ '^[0-9a-f]{64}$' then
      outcome := 'invalid';
    else
    select * into ticket_row from public.tickets
    where qr_token_hash = target_qr_hash
    for update;
    ticket_is_found := found;

    if not ticket_is_found then
      outcome := 'invalid';
    elsif ticket_row.organization_id <> session_row.organization_id
      or ticket_row.event_id <> session_row.event_id then
      outcome := 'wrong_event';
    elsif ticket_row.status = 'cancelled' then
      outcome := 'cancelled';
    elsif ticket_row.status = 'refunded' then
      outcome := 'refunded';
    elsif effective_now < ticket_row.valid_from then
      outcome := 'too_early';
    elsif effective_now > ticket_row.valid_until then
      outcome := 'too_late';
    elsif not exists (
      select 1 from public.access_gate_ticket_types rule
      where rule.access_gate_id = session_row.access_gate_id
        and rule.ticket_type_id = ticket_row.ticket_type_id
    ) then
      outcome := 'wrong_gate';
      select g.name into suggested_gate_value
      from public.access_gate_ticket_types rule
      join public.access_gates g on g.id = rule.access_gate_id
      where rule.ticket_type_id = ticket_row.ticket_type_id
        and rule.event_id = session_row.event_id
        and g.active
      order by g.name
      limit 1;
    elsif ticket_row.used_entries >= ticket_row.max_entries then
      outcome := 'already_used';
      select c.scanned_at, g.name into first_used_value, first_used_gate_value
      from public.checkins c
      left join public.access_gates g on g.id = c.access_gate_id
      where c.ticket_id = ticket_row.id and c.result = 'valid'
      order by c.scanned_at
      limit 1;
    else
      outcome := 'valid';
      entry_number_value := ticket_row.used_entries + 1;
      update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
      ticket_row.used_entries := entry_number_value;
    end if;
    end if;
  end if;

  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, scanned_at
  ) values (
    case when session_row.id is not null then session_row.organization_id else null end,
    case when session_row.id is not null then session_row.event_id else null end,
    case when ticket_is_found then ticket_row.id else null end,
    case when session_row.id is not null then session_row.access_gate_id else null end,
    case when session_row.id is not null then session_row.id else null end,
    outcome, 'qr', entry_number_value, target_idempotency_key, effective_now
  ) returning id into created_checkin_id;

  if ticket_is_found and ticket_row.event_id = session_row.event_id then
    select tt.name into ticket_type_name_value from public.ticket_types tt where tt.id = ticket_row.ticket_type_id;
    holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
  end if;
  if outcome = 'valid' and entry_number_value > 1 then
    select c.scanned_at, g.name into first_used_value, first_used_gate_value
    from public.checkins c
    left join public.access_gates g on g.id = c.access_gate_id
    where c.ticket_id = ticket_row.id and c.result = 'valid'
    order by c.scanned_at
    limit 1;
  end if;

  return query select outcome, created_checkin_id,
    case when ticket_is_found then ticket_row.id else null end,
    case when outcome in ('valid', 'already_used') then holder_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
    case when outcome in ('valid', 'already_used') then ticket_row.short_code else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.used_entries else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.max_entries else null end,
    first_used_value, first_used_gate_value,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_from else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_until else null end,
    suggested_gate_value, effective_now;
end;
$$;

create function public.supervisor_override_checkin(
  target_session_hash text,
  target_checkin uuid,
  target_reason public.checkin_override_reason,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  gate_row public.access_gates;
  event_row public.events;
  prior_checkin public.checkins;
  existing_override public.checkins;
  ticket_row public.tickets;
  ticket_type_name_value text;
  created_checkin_id uuid;
  entry_number_value integer;
  effective_now timestamptz := clock_timestamp();
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' or target_idempotency_key is null then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id for update;
  select * into gate_row from public.access_gates where id = session_row.access_gate_id;
  select * into event_row from public.events where id = session_row.event_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null
    or session_row.expires_at <= effective_now
    or authorization_row.revoked_at is not null
    or not gate_row.active
    or event_row.status not in ('published', 'sold_out') then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;

  select * into existing_override from public.checkins
  where idempotency_key = target_idempotency_key and scanner_session_id = session_row.id;
  if found then
    return jsonb_build_object('result', existing_override.result, 'checkin_id', existing_override.id);
  end if;

  select * into prior_checkin from public.checkins where id = target_checkin for update;
  if not found
    or prior_checkin.event_id <> session_row.event_id
    or prior_checkin.ticket_id is null
    or prior_checkin.result not in ('wrong_gate', 'too_early', 'too_late')
    or target_reason not in ('wrong_gate', 'outside_window', 'supervisor_exception') then
    raise exception 'OVERRIDE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into existing_override from public.checkins
  where override_of_checkin_id = prior_checkin.id;
  if found then
    return jsonb_build_object('result', existing_override.result, 'checkin_id', existing_override.id);
  end if;

  select * into ticket_row from public.tickets where id = prior_checkin.ticket_id for update;
  if ticket_row.status <> 'valid' or ticket_row.used_entries >= ticket_row.max_entries then
    raise exception 'OVERRIDE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  entry_number_value := ticket_row.used_entries + 1;
  update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
  select tt.name into ticket_type_name_value from public.ticket_types tt where tt.id = ticket_row.ticket_type_id;

  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, override,
    override_by_scanner_session_id, override_of_checkin_id, override_reason, scanned_at
  ) values (
    session_row.organization_id, session_row.event_id, ticket_row.id,
    session_row.access_gate_id, session_row.id, 'valid', 'qr', entry_number_value,
    target_idempotency_key, true, session_row.id, prior_checkin.id, target_reason, effective_now
  ) returning id into created_checkin_id;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    session_row.organization_id, 'access.checkin.override', 'checkin', created_checkin_id,
    jsonb_build_object(
      'original_checkin_id', prior_checkin.id,
      'scanner_session_id', session_row.id,
      'reason', target_reason,
      'entry_number', entry_number_value
    )
  );

  return jsonb_build_object(
    'result', 'valid',
    'checkin_id', created_checkin_id,
    'ticket_id', ticket_row.id,
    'holder_name', trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.'),
    'ticket_type_name', ticket_type_name_value,
    'sector', ticket_row.sector,
    'short_code', ticket_row.short_code,
    'used_entries', entry_number_value,
    'max_entries', ticket_row.max_entries,
    'scanned_at', effective_now,
    'override', true
  );
end;
$$;

create function public.get_supervisor_ticket_preview(
  target_session_hash text,
  target_short_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  ticket_row public.tickets;
  ticket_type_name_value text;
begin
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null
    or session_row.expires_at <= now()
    or authorization_row.revoked_at is not null then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions
  set manual_window_started_at = case
        when manual_window_started_at <= now() - interval '1 minute' then now()
        else manual_window_started_at
      end,
      manual_attempts = case
        when manual_window_started_at <= now() - interval '1 minute' then 1
        else manual_attempts + 1
      end,
      last_seen_at = now()
  where id = session_row.id
  returning * into session_row;
  if session_row.manual_attempts > 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  if upper(trim(target_short_code)) !~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$' then
    return jsonb_build_object('found', false);
  end if;
  select * into ticket_row from public.tickets
  where short_code = upper(trim(target_short_code)) and event_id = session_row.event_id;
  if not found then return jsonb_build_object('found', false); end if;
  select tt.name into ticket_type_name_value from public.ticket_types tt where tt.id = ticket_row.ticket_type_id;
  return jsonb_build_object(
    'found', true,
    'short_code', ticket_row.short_code,
    'holder_name', trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.'),
    'ticket_type_name', ticket_type_name_value,
    'sector', ticket_row.sector,
    'status', ticket_row.status,
    'used_entries', ticket_row.used_entries,
    'max_entries', ticket_row.max_entries,
    'valid_from', ticket_row.valid_from,
    'valid_until', ticket_row.valid_until
  );
end;
$$;

create function public.supervisor_manual_checkin(
  target_session_hash text,
  target_short_code text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_now timestamptz := clock_timestamp();
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  gate_row public.access_gates;
  event_row public.events;
  ticket_row public.tickets;
  prior_checkin public.checkins;
  outcome public.checkin_result := 'invalid'::public.checkin_result;
  created_checkin_id uuid;
  entry_number_value integer;
  ticket_type_name_value text;
  suggested_gate_value text;
  first_used_value timestamptz;
  first_used_gate_value text;
begin
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id for update;
  select * into gate_row from public.access_gates where id = session_row.access_gate_id;
  select * into event_row from public.events where id = session_row.event_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null
    or session_row.expires_at <= effective_now
    or authorization_row.revoked_at is not null
    or not gate_row.active
    or event_row.status not in ('published', 'sold_out') then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions
  set manual_window_started_at = case
        when manual_window_started_at <= effective_now - interval '1 minute' then effective_now
        else manual_window_started_at
      end,
      manual_attempts = case
        when manual_window_started_at <= effective_now - interval '1 minute' then 1
        else manual_attempts + 1
      end,
      last_seen_at = effective_now
  where id = session_row.id
  returning * into session_row;
  if session_row.manual_attempts > 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  select * into prior_checkin from public.checkins
  where idempotency_key = target_idempotency_key and scanner_session_id = session_row.id;
  if found then return jsonb_build_object('result', prior_checkin.result, 'checkin_id', prior_checkin.id); end if;

  if upper(trim(target_short_code)) ~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$' then
    select * into ticket_row from public.tickets
    where short_code = upper(trim(target_short_code)) and event_id = session_row.event_id
    for update;
  end if;

  if ticket_row.id is null then
    outcome := 'invalid';
  elsif ticket_row.status = 'cancelled' then
    outcome := 'cancelled';
  elsif ticket_row.status = 'refunded' then
    outcome := 'refunded';
  elsif effective_now < ticket_row.valid_from then
    outcome := 'too_early';
  elsif effective_now > ticket_row.valid_until then
    outcome := 'too_late';
  elsif not exists (
    select 1 from public.access_gate_ticket_types rule
    where rule.access_gate_id = session_row.access_gate_id and rule.ticket_type_id = ticket_row.ticket_type_id
  ) then
    outcome := 'wrong_gate';
    select g.name into suggested_gate_value
    from public.access_gate_ticket_types rule
    join public.access_gates g on g.id = rule.access_gate_id
    where rule.ticket_type_id = ticket_row.ticket_type_id and rule.event_id = session_row.event_id and g.active
    order by g.name limit 1;
  elsif ticket_row.used_entries >= ticket_row.max_entries then
    outcome := 'already_used';
    select c.scanned_at, g.name into first_used_value, first_used_gate_value
    from public.checkins c
    left join public.access_gates g on g.id = c.access_gate_id
    where c.ticket_id = ticket_row.id and c.result = 'valid'
    order by c.scanned_at
    limit 1;
  else
    outcome := 'valid';
    entry_number_value := ticket_row.used_entries + 1;
    update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
    ticket_row.used_entries := entry_number_value;
  end if;

  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, override,
    override_by_scanner_session_id, override_reason, scanned_at
  ) values (
    session_row.organization_id, session_row.event_id, ticket_row.id,
    session_row.access_gate_id, session_row.id, outcome, 'manual', entry_number_value,
    target_idempotency_key, true, session_row.id, 'manual_code', effective_now
  ) returning id into created_checkin_id;

  if ticket_row.id is not null then
    select tt.name into ticket_type_name_value from public.ticket_types tt where tt.id = ticket_row.ticket_type_id;
  end if;
  return jsonb_build_object(
    'result', outcome,
    'checkin_id', created_checkin_id,
    'ticket_id', ticket_row.id,
    'holder_name', case when outcome in ('valid', 'already_used') then trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.') else null end,
    'ticket_type_name', case when ticket_row.id is not null then ticket_type_name_value else null end,
    'sector', ticket_row.sector,
    'short_code', case when outcome in ('valid', 'already_used') then ticket_row.short_code else null end,
    'used_entries', ticket_row.used_entries,
    'max_entries', ticket_row.max_entries,
    'first_used_at', first_used_value,
    'first_used_gate_name', first_used_gate_value,
    'valid_from', ticket_row.valid_from,
    'valid_until', ticket_row.valid_until,
    'suggested_gate_name', suggested_gate_value,
    'scanned_at', effective_now,
    'override', true
  );
end;
$$;

create function public.get_event_access_metrics(target_event uuid)
returns table (
  entries_today bigint,
  valid_scans_today bigint,
  duplicate_scans_today bigint,
  rejected_scans_today bigint,
  active_devices bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  venue_timezone text;
  local_day date;
begin
  select e.* into event_row from public.events e where e.id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
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
      where s.event_id = target_event and s.revoked_at is null and s.expires_at > now()
        and a.revoked_at is null
    )
  from public.checkins c
  where c.event_id = target_event
    and (c.scanned_at at time zone venue_timezone)::date = local_day;
end;
$$;

create function public.get_event_recent_checkins(target_event uuid, result_limit integer default 30)
returns table (
  checkin_id uuid,
  result public.checkin_result,
  gate_name text,
  device_label text,
  ticket_type_name text,
  holder_name text,
  short_code text,
  entry_number integer,
  override boolean,
  source public.checkin_source,
  scanned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_organization uuid;
begin
  select e.organization_id into target_organization from public.events e where e.id = target_event;
  if target_organization is null or auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    c.id,
    c.result,
    g.name,
    a.label,
    tt.name,
    case when t.id is null then null else trim(t.holder_first_name || ' ' || left(t.holder_last_name, 1) || '.') end,
    t.short_code,
    c.entry_number,
    c.override,
    c.source,
    c.scanned_at
  from public.checkins c
  left join public.access_gates g on g.id = c.access_gate_id
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  left join public.scanner_device_authorizations a on a.id = s.authorization_id
  left join public.tickets t on t.id = c.ticket_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  where c.event_id = target_event
  order by c.scanned_at desc
  limit least(greatest(coalesce(result_limit, 30), 1), 100);
end;
$$;

revoke all on function public.create_access_gate(uuid, text, text, uuid[]) from public, anon, authenticated;
revoke all on function public.update_access_gate(uuid, text, text, boolean, uuid[]) from public, anon, authenticated;
revoke all on function public.create_scanner_authorization(uuid, uuid, text, public.scanner_permission, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_scanner_authorization(uuid) from public, anon, authenticated;
revoke all on function public.activate_scanner_device(text, text, text) from public, anon, authenticated;
revoke all on function public.get_scanner_session(text) from public, anon, authenticated;
revoke all on function public.revoke_scanner_session(uuid) from public, anon, authenticated;
revoke all on function public.revoke_current_scanner_session(text) from public, anon, authenticated;
revoke all on function public.check_in_ticket(text, text, uuid) from public, anon, authenticated;
revoke all on function public.supervisor_override_checkin(text, uuid, public.checkin_override_reason, uuid) from public, anon, authenticated;
revoke all on function public.get_supervisor_ticket_preview(text, text) from public, anon, authenticated;
revoke all on function public.supervisor_manual_checkin(text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_event_access_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_recent_checkins(uuid, integer) from public, anon, authenticated;

grant execute on function public.create_access_gate(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.update_access_gate(uuid, text, text, boolean, uuid[]) to authenticated;
grant execute on function public.create_scanner_authorization(uuid, uuid, text, public.scanner_permission, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.revoke_scanner_authorization(uuid) to authenticated;
grant execute on function public.revoke_scanner_session(uuid) to authenticated;
grant execute on function public.get_event_access_metrics(uuid) to authenticated;
grant execute on function public.get_event_recent_checkins(uuid, integer) to authenticated;

grant execute on function public.activate_scanner_device(text, text, text) to service_role;
grant execute on function public.get_scanner_session(text) to service_role;
grant execute on function public.revoke_current_scanner_session(text) to service_role;
grant execute on function public.check_in_ticket(text, text, uuid) to service_role;
grant execute on function public.supervisor_override_checkin(text, uuid, public.checkin_override_reason, uuid) to service_role;
grant execute on function public.get_supervisor_ticket_preview(text, text) to service_role;
grant execute on function public.supervisor_manual_checkin(text, text, uuid) to service_role;

grant select on public.access_gates, public.access_gate_ticket_types,
  public.scanner_device_authorizations, public.scanner_sessions, public.checkins to service_role;
grant select, insert, update, delete on public.scanner_activation_rate_limits to service_role;
grant insert, update on public.scanner_sessions, public.scanner_device_authorizations, public.checkins to service_role;
