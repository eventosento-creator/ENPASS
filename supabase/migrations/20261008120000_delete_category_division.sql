-- Borrar categorías y divisiones. Solo si no tienen socios: el historial de cuotas y pagos no se pierde.
-- (Si tienen socios, hay que desactivarlas o mover a los socios antes.)

create or replace function public.delete_membership_category(target_org uuid, target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_categories where id = target_id and organization_id = target_org) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships where membership_category_id = target_id) then
    raise exception 'CATEGORY_IN_USE' using errcode = 'P0001';
  end if;
  -- Las divisiones de la categoría quedan sin categoría; las solicitudes pendientes pierden la categoría (FK set null).
  delete from public.membership_categories where id = target_id and organization_id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.category.deleted', 'membership_category', target_id);
end;
$$;
revoke all on function public.delete_membership_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_membership_category(uuid, uuid) to authenticated;

create or replace function public.delete_division(target_org uuid, target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.divisions where id = target_id and organization_id = target_org) then
    raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership_division_enrollments where division_id = target_id) then
    raise exception 'DIVISION_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.divisions where id = target_id and organization_id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.division.deleted', 'division', target_id);
end;
$$;
revoke all on function public.delete_division(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_division(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
