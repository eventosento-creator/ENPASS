-- Portada, ubicación y actividad del club: se cargan en Ajustes y se muestran en el banner del
-- panel del club y en su página pública.

alter table public.club_settings
  add column if not exists cover_image_url text,
  add column if not exists location_text text check (location_text is null or char_length(location_text) <= 120),
  add column if not exists main_activity text check (main_activity is null or char_length(main_activity) <= 60);

-- Guarda portada/ubicación/actividad. Mismo patrón que set_club_branding (solo owner/admin de la organización).
create or replace function public.set_club_profile(target_org uuid, target_cover_url text, target_location text, target_activity text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.club_settings (organization_id, cover_image_url, location_text, main_activity)
  values (target_org, nullif(trim(coalesce(target_cover_url, '')), ''), nullif(trim(coalesce(target_location, '')), ''), nullif(trim(coalesce(target_activity, '')), ''))
  on conflict (organization_id) do update set
    cover_image_url = nullif(trim(coalesce(target_cover_url, '')), ''),
    location_text = nullif(trim(coalesce(target_location, '')), ''),
    main_activity = nullif(trim(coalesce(target_activity, '')), '');
end;
$$;
revoke all on function public.set_club_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_club_profile(uuid, text, text, text) to authenticated;

-- Lecturas públicas con los campos nuevos (cambia lo que devuelven, por eso se recrean).
drop function if exists public.get_public_club_profile(text);
create or replace function public.get_public_club_profile(target_slug text)
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, currency char(3), cover_image_url text, location_text text, main_activity text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color, o.default_currency,
    cs.cover_image_url, cs.location_text, cs.main_activity
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where o.slug = target_slug and cs.enabled = true and cs.public_listing_status = 'approved';
$$;
revoke all on function public.get_public_club_profile(text) from public;
grant execute on function public.get_public_club_profile(text) to anon, authenticated;

drop function if exists public.get_public_clubs_discovery();
create or replace function public.get_public_clubs_discovery()
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, category_count bigint, cover_image_url text, location_text text)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color,
    (select count(*) from public.membership_categories mc where mc.organization_id = o.id and mc.active = true),
    cs.cover_image_url, cs.location_text
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where cs.enabled = true and cs.public_listing_status = 'approved'
  order by o.name;
$$;
revoke all on function public.get_public_clubs_discovery() from public;
grant execute on function public.get_public_clubs_discovery() to anon, authenticated;

-- Cuotas pendientes del socio (con su id real) para poder pagarlas online desde su perfil.
-- Solo devuelve cuotas sin pagar de la membresía de la sesión; el cobro lo valida la app contra esta misma lista.
create or replace function public.member_pending_dues(target_session_hash text)
returns table (due_id uuid, kind text, concept text, period date, amount bigint, due_date date, overdue boolean)
language plpgsql security definer set search_path = '' as $$
declare session_row public.member_sessions;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into session_row from public.member_sessions s
  where s.token_hash = target_session_hash and s.revoked_at is null and s.expires_at > now();
  if not found then return; end if;
  return query
  select d.id, 'club'::text, 'Cuota de socio'::text, d.period, d.amount, d.due_date, d.due_date < current_date
  from public.membership_dues d
  where d.membership_id = session_row.membership_id and d.paid_at is null and d.amount > 0
  union all
  select d.id, 'division'::text, ('División ' || dv.name)::text, d.period, d.amount, d.due_date, d.due_date < current_date
  from public.division_dues d
  join public.membership_division_enrollments e on e.id = d.enrollment_id
  join public.divisions dv on dv.id = e.division_id
  where e.membership_id = session_row.membership_id and d.paid_at is null and d.amount > 0
  order by 4, 3;
end;
$$;
revoke all on function public.member_pending_dues(text) from public, anon, authenticated;
grant execute on function public.member_pending_dues(text) to service_role;

notify pgrst, 'reload schema';
