-- Ajuste de la portada del club: punto de enfoque (0-100 en horizontal y vertical) para elegir
-- qué parte de la foto queda visible cuando se recorta en banners y tarjetas.

alter table public.club_settings
  add column if not exists cover_focus_x smallint not null default 50 check (cover_focus_x between 0 and 100),
  add column if not exists cover_focus_y smallint not null default 50 check (cover_focus_y between 0 and 100);

drop function if exists public.set_club_profile(uuid, text, text, text);
create or replace function public.set_club_profile(target_org uuid, target_cover_url text, target_location text, target_activity text, target_focus_x integer default 50, target_focus_y integer default 50)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.club_settings (organization_id, cover_image_url, location_text, main_activity, cover_focus_x, cover_focus_y)
  values (target_org, nullif(trim(coalesce(target_cover_url, '')), ''), nullif(trim(coalesce(target_location, '')), ''), nullif(trim(coalesce(target_activity, '')), ''),
    greatest(0, least(100, coalesce(target_focus_x, 50))), greatest(0, least(100, coalesce(target_focus_y, 50))))
  on conflict (organization_id) do update set
    cover_image_url = nullif(trim(coalesce(target_cover_url, '')), ''),
    location_text = nullif(trim(coalesce(target_location, '')), ''),
    main_activity = nullif(trim(coalesce(target_activity, '')), ''),
    cover_focus_x = greatest(0, least(100, coalesce(target_focus_x, 50))),
    cover_focus_y = greatest(0, least(100, coalesce(target_focus_y, 50)));
end;
$$;
revoke all on function public.set_club_profile(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.set_club_profile(uuid, text, text, text, integer, integer) to authenticated;

drop function if exists public.get_public_club_profile(text);
create or replace function public.get_public_club_profile(target_slug text)
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, currency char(3), cover_image_url text, location_text text, main_activity text, cover_focus_x smallint, cover_focus_y smallint)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color, o.default_currency,
    cs.cover_image_url, cs.location_text, cs.main_activity, cs.cover_focus_x, cs.cover_focus_y
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where o.slug = target_slug and cs.enabled = true and cs.public_listing_status = 'approved';
$$;
revoke all on function public.get_public_club_profile(text) from public;
grant execute on function public.get_public_club_profile(text) to anon, authenticated;

drop function if exists public.get_public_clubs_discovery();
create or replace function public.get_public_clubs_discovery()
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, category_count bigint, cover_image_url text, location_text text, cover_focus_x smallint, cover_focus_y smallint)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color,
    (select count(*) from public.membership_categories mc where mc.organization_id = o.id and mc.active = true),
    cs.cover_image_url, cs.location_text, cs.cover_focus_x, cs.cover_focus_y
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where cs.enabled = true and cs.public_listing_status = 'approved'
  order by o.name;
$$;
revoke all on function public.get_public_clubs_discovery() from public;
grant execute on function public.get_public_clubs_discovery() to anon, authenticated;

notify pgrst, 'reload schema';
