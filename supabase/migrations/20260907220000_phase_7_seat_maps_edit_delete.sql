-- Phase 7 follow-up: allow editing and deleting a seat map section that has no sales/holds yet.

create function public.update_seat_map_section(
  target_section uuid,
  target_name text,
  target_description text,
  target_base_price_amount bigint,
  target_service_fee_bps integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  section_row public.seat_map_sections;
begin
  select * into section_row from public.seat_map_sections where id = target_section for update;
  if not found or auth.uid() is null or not public.can_manage_org(section_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 100
    or char_length(coalesce(target_description, '')) > 500
    or target_base_price_amount < 0
    or (target_service_fee_bps is not null and target_service_fee_bps not between 0 and 10000) then
    raise exception 'INVALID_SEAT_MAP_SECTION' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.seat_map_sections other
    where other.event_id = section_row.event_id and other.id <> section_row.id
      and lower(other.name) = lower(trim(target_name))
  ) then
    raise exception 'DUPLICATE_SEAT_MAP_SECTION_NAME' using errcode = 'P0001';
  end if;
  update public.seat_map_sections set
    name = trim(target_name),
    description = trim(coalesce(target_description, '')),
    base_price_amount = target_base_price_amount,
    service_fee_bps = target_service_fee_bps
  where id = section_row.id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    section_row.organization_id, auth.uid(), 'seat_map_section.updated', 'seat_map_section', section_row.id,
    jsonb_build_object('name', trim(target_name), 'base_price_amount', target_base_price_amount)
  );
end;
$$;

create function public.delete_seat_map_section(target_section uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  section_row public.seat_map_sections;
begin
  select * into section_row from public.seat_map_sections where id = target_section for update;
  if not found or auth.uid() is null or not public.can_manage_org(section_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.seat_holds h
    join public.event_seats es on es.id = h.event_seat_id
    where es.section_id = section_row.id
  ) then
    raise exception 'SEAT_MAP_SECTION_HAS_ACTIVITY' using errcode = 'P0001';
  end if;
  delete from public.event_seats where section_id = section_row.id;
  delete from public.seat_map_sections where id = section_row.id;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    section_row.organization_id, auth.uid(), 'seat_map_section.deleted', 'seat_map_section', section_row.id,
    jsonb_build_object('name', section_row.name)
  );
end;
$$;

revoke all on function public.update_seat_map_section(uuid, text, text, bigint, integer) from public, anon, authenticated;
revoke all on function public.delete_seat_map_section(uuid) from public, anon, authenticated;
grant execute on function public.update_seat_map_section(uuid, text, text, bigint, integer) to authenticated;
grant execute on function public.delete_seat_map_section(uuid) to authenticated;
