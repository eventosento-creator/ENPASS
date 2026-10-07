-- Divisiones del club visibles en su página pública (/clubes/<club>), igual que las categorías.
-- Solo para clubes habilitados y aprobados en el directorio, y solo divisiones activas.
create or replace function public.get_public_club_divisions(target_org uuid)
returns table (id uuid, name text, monthly_fee_amount bigint)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.monthly_fee_amount
  from public.divisions d
  join public.club_settings cs on cs.organization_id = d.organization_id
  where d.organization_id = target_org and d.active = true
    and cs.enabled = true and cs.public_listing_status = 'approved'
  order by d.sort_order, d.name;
$$;
revoke all on function public.get_public_club_divisions(uuid) from public;
grant execute on function public.get_public_club_divisions(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
