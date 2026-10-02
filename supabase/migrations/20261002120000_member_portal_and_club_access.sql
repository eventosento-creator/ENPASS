-- Perfil del socio (login con DNI o mail + contraseña, QR personal) y control de ingreso al club.
--
-- Los socios NO usan auth.users (eso es para productores y los mandaría al panel): tienen su
-- propia credencial/sesión opaca, igual que las sesiones de scanner y de comprador. Todas las
-- funciones del portal son SOLO service_role (se llaman desde acciones de servidor).
-- El QR del socio es dinámico y se firma en la app (HMAC), no se guarda nada por socio.

-- ---------------------------------------------------------------------------------------------
-- Credenciales y sesiones del socio
-- ---------------------------------------------------------------------------------------------
create table public.member_credentials (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  password_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.member_sessions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index member_sessions_membership_idx on public.member_sessions(membership_id);

create table public.member_password_tokens (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.member_credentials enable row level security;
alter table public.member_sessions enable row level security;
alter table public.member_password_tokens enable row level security;
-- Sin policies: acceso solo vía las funciones SECURITY DEFINER de abajo.

-- ---------------------------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------------------------
-- Busca el socio de un club por DNI (solo dígitos, tolera puntos/espacios) o por mail.
create function public.member_lookup(target_org uuid, target_identifier text)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.memberships m
  join public.customers c on c.id = m.customer_id
  where m.organization_id = target_org
    and m.status in ('active', 'suspended')
    and (
      (position('@' in target_identifier) > 0 and lower(c.email) = lower(trim(target_identifier)))
      or (position('@' in target_identifier) = 0
          and char_length(regexp_replace(target_identifier, '\D', '', 'g')) >= 6
          and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = regexp_replace(target_identifier, '\D', '', 'g'))
    )
  order by (m.status = 'active') desc, m.created_at
  limit 1;
$$;
revoke all on function public.member_lookup(uuid, text) from public, anon, authenticated;

-- "Al día" = ninguna cuota vencida sin pagar (cuota de socio ni de divisiones activas).
create function public.membership_standing(target_membership uuid)
returns table (overdue_count integer, overdue_amount bigint)
language sql stable security definer set search_path = '' as $$
  select count(*)::integer, coalesce(sum(x.amount), 0)::bigint
  from (
    select d.amount from public.membership_dues d
    where d.membership_id = target_membership and d.paid_at is null and d.due_date < current_date
    union all
    select d.amount from public.division_dues d
    join public.membership_division_enrollments e on e.id = d.enrollment_id
    where e.membership_id = target_membership and e.status = 'active' and d.paid_at is null and d.due_date < current_date
  ) x;
$$;
revoke all on function public.membership_standing(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Portal del socio (service_role)
-- ---------------------------------------------------------------------------------------------
create function public.member_portal_club(target_slug text)
returns table (organization_id uuid, name text, slug text, logo_url text, brand_name text, accent_color text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.slug, cs.brand_logo_url, cs.brand_name, cs.brand_accent_color
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id and cs.enabled = true
  where o.slug = target_slug;
$$;

-- Pide un link para crear/recuperar la contraseña. No revela si el socio existe (devuelve vacío).
-- Máximo 1 pedido por minuto por socio para no usar el mail como arma de spam.
create function public.member_request_password_token(target_org uuid, target_identifier text, target_token_hash text)
returns table (membership_id uuid, email text, first_name text, organization_name text, brand_logo_url text, brand_name text, brand_accent_color text)
language plpgsql security definer set search_path = '' as $$
declare found_membership uuid;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$' then return; end if;
  found_membership := public.member_lookup(target_org, target_identifier);
  if found_membership is null then return; end if;
  if exists (select 1 from public.member_password_tokens t where t.membership_id = found_membership and t.created_at > now() - interval '1 minute') then
    return;
  end if;
  delete from public.member_password_tokens t where t.membership_id = found_membership and t.used_at is null;
  insert into public.member_password_tokens (membership_id, token_hash, expires_at)
  values (found_membership, target_token_hash, now() + interval '2 hours');
  return query
  select m.id, c.email, c.first_name, o.name, cs.brand_logo_url, cs.brand_name, cs.brand_accent_color
  from public.memberships m
  join public.customers c on c.id = m.customer_id
  join public.organizations o on o.id = m.organization_id
  left join public.club_settings cs on cs.organization_id = m.organization_id
  where m.id = found_membership;
end;
$$;

-- Crea o cambia la contraseña con el token del mail y deja al socio logueado.
create function public.member_set_password(target_token_hash text, target_password text, target_session_hash text, target_session_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token_row public.member_password_tokens;
begin
  if char_length(coalesce(target_password, '')) < 8 or char_length(target_password) > 72 then
    raise exception 'WEAK_PASSWORD' using errcode = 'P0001';
  end if;
  if target_session_hash !~ '^[0-9a-f]{64}$' or target_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into token_row from public.member_password_tokens
  where token_hash = target_token_hash and used_at is null and expires_at > now() for update;
  if not found then return null; end if;
  insert into public.member_credentials (membership_id, password_hash)
  values (token_row.membership_id, extensions.crypt(target_password, extensions.gen_salt('bf', 10)))
  on conflict (membership_id) do update
    set password_hash = excluded.password_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  update public.member_password_tokens set used_at = now() where id = token_row.id;
  update public.member_sessions set revoked_at = now() where membership_id = token_row.membership_id and revoked_at is null;
  insert into public.member_sessions (membership_id, token_hash, expires_at)
  values (token_row.membership_id, target_session_hash, target_session_expires_at);
  return token_row.membership_id;
end;
$$;

create function public.member_login(target_org uuid, target_identifier text, target_password text, target_session_hash text, target_session_expires_at timestamptz)
returns table (login_status text, membership_id uuid)
language plpgsql security definer set search_path = '' as $$
declare found_membership uuid; cred public.member_credentials;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return query select 'invalid'::text, null::uuid; return; end if;
  found_membership := public.member_lookup(target_org, target_identifier);
  if found_membership is null then return query select 'invalid'::text, null::uuid; return; end if;
  select * into cred from public.member_credentials c where c.membership_id = found_membership for update;
  if not found then return query select 'invalid'::text, null::uuid; return; end if;
  if cred.locked_until is not null and cred.locked_until > now() then
    return query select 'locked'::text, null::uuid; return;
  end if;
  if cred.password_hash <> extensions.crypt(coalesce(target_password, ''), cred.password_hash) then
    update public.member_credentials c
    set failed_attempts = c.failed_attempts + 1,
        locked_until = case when c.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where c.membership_id = found_membership;
    return query select 'invalid'::text, null::uuid; return;
  end if;
  update public.member_credentials c set failed_attempts = 0, locked_until = null where c.membership_id = found_membership;
  insert into public.member_sessions (membership_id, token_hash, expires_at)
  values (found_membership, target_session_hash, target_session_expires_at);
  return query select 'ok'::text, found_membership;
end;
$$;

create function public.member_get_profile(target_session_hash text)
returns table (
  membership_id uuid, organization_id uuid, organization_name text, club_slug text, member_number text,
  first_name text, last_name text, category_name text, member_status text,
  overdue_count integer, overdue_amount bigint, divisions text[],
  brand_logo_url text, brand_name text, brand_accent_color text, debt_blocks_entry boolean
) language plpgsql security definer set search_path = '' as $$
declare session_row public.member_sessions;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.member_sessions s
  where s.token_hash = target_session_hash and s.revoked_at is null and s.expires_at > now();
  if not found then return; end if;
  update public.member_sessions set last_seen_at = now() where id = session_row.id;
  return query
  select m.id, m.organization_id, o.name, o.slug, m.member_number, c.first_name, c.last_name, mc.name, m.status,
    st.overdue_count, st.overdue_amount,
    coalesce((select array_agg(dv.name order by dv.name) from public.membership_division_enrollments e
      join public.divisions dv on dv.id = e.division_id where e.membership_id = m.id and e.status = 'active'), '{}'::text[]),
    cs.brand_logo_url, cs.brand_name, cs.brand_accent_color, coalesce(cs.debt_blocks_entry, false)
  from public.memberships m
  join public.customers c on c.id = m.customer_id
  join public.organizations o on o.id = m.organization_id
  join public.membership_categories mc on mc.id = m.membership_category_id
  left join public.club_settings cs on cs.organization_id = m.organization_id
  cross join lateral public.membership_standing(m.id) st
  where m.id = session_row.membership_id and m.status in ('active', 'suspended');
end;
$$;

create function public.member_get_dues(target_session_hash text)
returns table (concept text, period date, amount bigint, due_date date, paid_at timestamptz, paid_amount bigint, payment_method text, payment_reference text, status text)
language plpgsql security definer set search_path = '' as $$
declare session_row public.member_sessions;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.member_sessions s
  where s.token_hash = target_session_hash and s.revoked_at is null and s.expires_at > now();
  if not found then return; end if;
  return query
  select 'Cuota de socio'::text, d.period, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method, d.payment_reference,
    case when d.paid_at is not null then 'paid' when d.due_date < current_date then 'overdue' else 'pending' end
  from public.membership_dues d where d.membership_id = session_row.membership_id
  union all
  select ('División ' || dv.name)::text, d.period, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method, d.payment_reference,
    case when d.paid_at is not null then 'paid' when d.due_date < current_date then 'overdue' else 'pending' end
  from public.division_dues d
  join public.membership_division_enrollments e on e.id = d.enrollment_id
  join public.divisions dv on dv.id = e.division_id
  where e.membership_id = session_row.membership_id
  order by 2 desc, 1;
end;
$$;

create function public.member_logout(target_session_hash text)
returns void language sql security definer set search_path = '' as $$
  update public.member_sessions set revoked_at = coalesce(revoked_at, now()) where token_hash = target_session_hash;
$$;

-- ---------------------------------------------------------------------------------------------
-- Control de ingreso al club: dispositivos de puerta (PIN reutilizable, igual que scanner/caja)
-- ---------------------------------------------------------------------------------------------
create table public.club_door_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  pin_hash text,
  code_expires_at timestamptz not null,
  activation_count integer not null default 0 check (activation_count >= 0),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((activation_count = 0 and activated_at is null) or (activation_count > 0 and activated_at is not null)),
  check ((revoked_at is null and pin_hash is not null) or (revoked_at is not null and pin_hash is null))
);

create table public.club_door_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.club_door_devices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.club_access_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid references public.memberships(id) on delete set null,
  door_device_id uuid references public.club_door_devices(id) on delete set null,
  result text not null check (result in ('allowed', 'allowed_with_debt', 'denied_debt', 'denied_suspended', 'denied_cancelled', 'invalid')),
  member_name text,
  member_number text,
  overdue_amount bigint,
  created_at timestamptz not null default now()
);
create index club_access_logs_org_idx on public.club_access_logs(organization_id, created_at desc);

alter table public.club_door_devices enable row level security;
alter table public.club_door_sessions enable row level security;
alter table public.club_access_logs enable row level security;
create policy club_door_devices_select on public.club_door_devices for select to authenticated
  using ((select public.can_manage_club(organization_id)));
create policy club_access_logs_select on public.club_access_logs for select to authenticated
  using ((select public.can_manage_club(organization_id)));
grant select on public.club_door_devices, public.club_access_logs to authenticated;

create function public.set_club_debt_blocks_entry(target_org uuid, target_blocks boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.club_settings (organization_id, debt_blocks_entry) values (target_org, target_blocks)
  on conflict (organization_id) do update set debt_blocks_entry = excluded.debt_blocks_entry, updated_at = now();
end;
$$;
revoke all on function public.set_club_debt_blocks_entry(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_club_debt_blocks_entry(uuid, boolean) to authenticated;

create function public.create_club_door_device(target_org uuid, device_name text, target_pin text, target_code_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.club_settings cs where cs.organization_id = target_org and cs.enabled) then
    raise exception 'CLUB_DISABLED' using errcode = 'P0001';
  end if;
  if target_pin !~ '^[0-9]{6}$' or char_length(trim(device_name)) not between 2 and 80
    or target_code_expires_at <= now() or target_code_expires_at > now() + interval '1 hour' then
    raise exception 'INVALID_DEVICE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.club_door_devices d where d.pin_hash is not null and d.revoked_at is null
    and d.pin_hash = extensions.crypt(target_pin, d.pin_hash)) then
    raise exception 'PIN_COLLISION' using errcode = 'P0001';
  end if;
  insert into public.club_door_devices (organization_id, name, pin_hash, code_expires_at, created_by)
  values (target_org, trim(device_name), extensions.crypt(target_pin, extensions.gen_salt('bf', 10)), target_code_expires_at, auth.uid())
  returning id into created_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club_door.device.created', 'club_door_device', created_id);
  return created_id;
end;
$$;
revoke all on function public.create_club_door_device(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_club_door_device(uuid, text, text, timestamptz) to authenticated;

create function public.revoke_club_door_device(target_device uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare device_row public.club_door_devices;
begin
  select * into device_row from public.club_door_devices where id = target_device for update;
  if not found or auth.uid() is null or not public.can_manage_org(device_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.club_door_devices set revoked_at = coalesce(revoked_at, now()), pin_hash = null where id = device_row.id;
  update public.club_door_sessions set revoked_at = coalesce(revoked_at, now()) where device_id = device_row.id and revoked_at is null;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (device_row.organization_id, auth.uid(), 'club_door.device.revoked', 'club_door_device', device_row.id);
end;
$$;
revoke all on function public.revoke_club_door_device(uuid) from public, anon, authenticated;
grant execute on function public.revoke_club_door_device(uuid) to authenticated;

-- Misma mecánica que activate_scanner_device: la primera activación respeta la ventana corta del
-- PIN; después sirve para reabrir el mismo dispositivo hasta que se revoque. Comparte el límite de
-- intentos por huella con scanner/caja.
create function public.activate_club_door_device(target_pin text, target_session_hash text, target_fingerprint_hash text)
returns table (activation_status text, door_session_id uuid, organization_id uuid, organization_name text, device_name text, expires_at timestamptz, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  rate_row public.scanner_activation_rate_limits;
  device_row public.club_door_devices;
  org_row public.organizations;
  created_session uuid;
  session_expires timestamptz := now() + interval '30 days';
  next_attempts integer;
  blocked_until_value timestamptz;
begin
  if target_pin !~ '^[0-9]{6}$' or target_session_hash !~ '^[0-9a-f]{64}$' or target_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text, null::timestamptz, 0; return;
  end if;
  insert into public.scanner_activation_rate_limits (fingerprint_hash) values (target_fingerprint_hash)
  on conflict (fingerprint_hash) do nothing;
  select * into rate_row from public.scanner_activation_rate_limits where fingerprint_hash = target_fingerprint_hash for update;
  if rate_row.blocked_until is not null and rate_row.blocked_until > now() then
    return query select 'rate_limited'::text, null::uuid, null::uuid, null::text, null::text, null::timestamptz,
      greatest(1, ceil(extract(epoch from (rate_row.blocked_until - now())))::integer);
    return;
  end if;
  if rate_row.window_started_at <= now() - interval '15 minutes' then
    update public.scanner_activation_rate_limits set window_started_at = now(), failed_attempts = 0, blocked_until = null, updated_at = now()
    where fingerprint_hash = target_fingerprint_hash returning * into rate_row;
  end if;
  select d.* into device_row from public.club_door_devices d
  where d.pin_hash is not null and d.revoked_at is null
    and ((d.activation_count = 0 and d.code_expires_at > now()) or d.activation_count > 0)
    and d.pin_hash = extensions.crypt(target_pin, d.pin_hash)
  order by d.created_at desc limit 1 for update of d;
  if not found then
    next_attempts := rate_row.failed_attempts + 1;
    blocked_until_value := case when next_attempts >= 5 then now() + interval '15 minutes' else null end;
    update public.scanner_activation_rate_limits set failed_attempts = next_attempts, blocked_until = blocked_until_value, updated_at = now()
    where fingerprint_hash = target_fingerprint_hash;
    return query select case when blocked_until_value is null then 'invalid' else 'rate_limited' end::text,
      null::uuid, null::uuid, null::text, null::text, null::timestamptz, case when blocked_until_value is null then 0 else 900 end;
    return;
  end if;
  select * into org_row from public.organizations o where o.id = device_row.organization_id;
  if not exists (select 1 from public.club_settings cs where cs.organization_id = device_row.organization_id and cs.enabled) then
    return query select 'expired'::text, null::uuid, null::uuid, null::text, null::text, null::timestamptz, 0; return;
  end if;
  update public.club_door_sessions set revoked_at = coalesce(revoked_at, now()) where device_id = device_row.id and revoked_at is null;
  insert into public.club_door_sessions (device_id, organization_id, session_token_hash, expires_at)
  values (device_row.id, device_row.organization_id, target_session_hash, session_expires) returning id into created_session;
  update public.club_door_devices set activation_count = activation_count + 1, activated_at = coalesce(activated_at, now()) where id = device_row.id;
  update public.scanner_activation_rate_limits set failed_attempts = 0, window_started_at = now(), blocked_until = null, updated_at = now()
  where fingerprint_hash = target_fingerprint_hash;
  return query select 'ok'::text, created_session, org_row.id, org_row.name, device_row.name, session_expires, 0;
end;
$$;

create function public.get_club_door_session(target_session_hash text)
returns table (door_session_id uuid, organization_id uuid, organization_name text, device_name text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare session_row public.club_door_sessions;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.club_door_sessions s
  where s.session_token_hash = target_session_hash and s.revoked_at is null and s.expires_at > now();
  if not found then return; end if;
  update public.club_door_sessions set last_seen_at = now() where id = session_row.id;
  return query
  select session_row.id, o.id, o.name, d.name, session_row.expires_at
  from public.club_door_devices d join public.organizations o on o.id = d.organization_id
  where d.id = session_row.device_id and d.revoked_at is null;
end;
$$;

create function public.revoke_current_club_door_session(target_session_hash text)
returns void language sql security definer set search_path = '' as $$
  update public.club_door_sessions set revoked_at = coalesce(revoked_at, now()) where session_token_hash = target_session_hash;
$$;

-- Decide si el socio entra. La app ya verificó la firma del QR; acá se valida el dispositivo
-- de puerta, que el socio sea de ese club, su estado y si está al día. La deuda solo bloquea si
-- el club activó "bloquear ingreso con deuda" (si no, entra pero se avisa).
create function public.check_in_member(target_session_hash text, target_membership uuid)
returns table (result text, member_name text, member_number text, category_name text, overdue_amount bigint)
language plpgsql security definer set search_path = '' as $$
declare
  session_row public.club_door_sessions;
  m public.memberships;
  full_name text; cat_name text;
  st_count integer; st_amount bigint;
  blocks boolean;
  outcome text;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then
    return query select 'device_not_authorized'::text, null::text, null::text, null::text, null::bigint; return;
  end if;
  select * into session_row from public.club_door_sessions s
  where s.session_token_hash = target_session_hash and s.revoked_at is null and s.expires_at > now();
  if not found or not exists (select 1 from public.club_door_devices d where d.id = session_row.device_id and d.revoked_at is null) then
    return query select 'device_not_authorized'::text, null::text, null::text, null::text, null::bigint; return;
  end if;
  update public.club_door_sessions set last_seen_at = now() where id = session_row.id;

  select * into m from public.memberships where id = target_membership and organization_id = session_row.organization_id;
  if not found then
    insert into public.club_access_logs (organization_id, door_device_id, result) values (session_row.organization_id, session_row.device_id, 'invalid');
    return query select 'invalid'::text, null::text, null::text, null::text, null::bigint; return;
  end if;
  select c.first_name || ' ' || c.last_name into full_name from public.customers c where c.id = m.customer_id;
  select mc.name into cat_name from public.membership_categories mc where mc.id = m.membership_category_id;
  select s.overdue_count, s.overdue_amount into st_count, st_amount from public.membership_standing(m.id) s;
  select coalesce(cs.debt_blocks_entry, false) into blocks from public.club_settings cs where cs.organization_id = m.organization_id;

  outcome := case
    when m.status = 'cancelled' then 'denied_cancelled'
    when m.status = 'suspended' then 'denied_suspended'
    when st_count > 0 and coalesce(blocks, false) then 'denied_debt'
    when st_count > 0 then 'allowed_with_debt'
    else 'allowed' end;
  insert into public.club_access_logs (organization_id, membership_id, door_device_id, result, member_name, member_number, overdue_amount)
  values (m.organization_id, m.id, session_row.device_id, outcome, full_name, m.member_number, st_amount);
  return query select outcome, full_name, m.member_number, cat_name, st_amount;
end;
$$;

create function public.get_club_access_log(target_org uuid, target_limit integer default 30)
returns table (created_at timestamptz, result text, member_name text, member_number text, overdue_amount bigint, device_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select l.created_at, l.result, l.member_name, l.member_number, l.overdue_amount, d.name
  from public.club_access_logs l left join public.club_door_devices d on d.id = l.door_device_id
  where l.organization_id = target_org
  order by l.created_at desc
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
end;
$$;
revoke all on function public.get_club_access_log(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_club_access_log(uuid, integer) to authenticated;

-- service_role-only: portal del socio y puerta del club.
revoke all on function
  public.member_portal_club(text), public.member_request_password_token(uuid, text, text),
  public.member_set_password(text, text, text, timestamptz), public.member_login(uuid, text, text, text, timestamptz),
  public.member_get_profile(text), public.member_get_dues(text), public.member_logout(text),
  public.activate_club_door_device(text, text, text), public.get_club_door_session(text),
  public.revoke_current_club_door_session(text), public.check_in_member(text, uuid)
from public, anon, authenticated;
grant execute on function
  public.member_portal_club(text), public.member_request_password_token(uuid, text, text),
  public.member_set_password(text, text, text, timestamptz), public.member_login(uuid, text, text, text, timestamptz),
  public.member_get_profile(text), public.member_get_dues(text), public.member_logout(text),
  public.activate_club_door_device(text, text, text), public.get_club_door_session(text),
  public.revoke_current_club_door_session(text), public.check_in_member(text, uuid)
to service_role;
