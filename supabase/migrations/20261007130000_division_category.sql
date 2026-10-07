-- Cada división puede pertenecer a una categoría (ej. categoría "Futsal" → divisiones C13, C17, 1ra).
-- Es opcional: las divisiones sin categoría siguen funcionando como hasta ahora.

alter table public.divisions
  add column if not exists membership_category_id uuid references public.membership_categories(id) on delete set null;
create index if not exists divisions_category_idx on public.divisions(membership_category_id);

-- Asigna (o quita, con null) la categoría de una división. Solo quien administra el club, y la categoría tiene que ser del mismo club.
create or replace function public.set_division_category(target_division uuid, target_category uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare division_org uuid;
begin
  select organization_id into division_org from public.divisions where id = target_division;
  if division_org is null or auth.uid() is null or not public.can_manage_club(division_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_category is not null and not exists (
    select 1 from public.membership_categories where id = target_category and organization_id = division_org
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  update public.divisions set membership_category_id = target_category, updated_at = now() where id = target_division;
end;
$$;
revoke all on function public.set_division_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_division_category(uuid, uuid) to authenticated;

-- Listado del panel, ahora con la categoría de cada división.
drop function if exists public.list_divisions(uuid);
create or replace function public.list_divisions(target_org uuid)
returns table (division_id uuid, name text, monthly_fee_amount bigint, active boolean, enrolled_count bigint, category_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select d.id, d.name, d.monthly_fee_amount, d.active,
    (select count(*) from public.membership_division_enrollments e where e.division_id = d.id and e.status = 'active'),
    d.membership_category_id
  from public.divisions d
  where d.organization_id = target_org
  order by d.sort_order, d.name;
end;
$$;
revoke all on function public.list_divisions(uuid) from public, anon;
grant execute on function public.list_divisions(uuid) to authenticated;

-- Divisiones públicas, con su categoría.
drop function if exists public.get_public_club_divisions(uuid);
create or replace function public.get_public_club_divisions(target_org uuid)
returns table (id uuid, name text, monthly_fee_amount bigint, category_id uuid)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.monthly_fee_amount, d.membership_category_id
  from public.divisions d
  join public.club_settings cs on cs.organization_id = d.organization_id
  where d.organization_id = target_org and d.active = true
    and cs.enabled = true and cs.public_listing_status = 'approved'
  order by d.sort_order, d.name;
$$;
revoke all on function public.get_public_club_divisions(uuid) from public;
grant execute on function public.get_public_club_divisions(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
