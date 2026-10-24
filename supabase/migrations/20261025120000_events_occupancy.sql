-- Entradas vendidas (vigentes) por evento de una organización, en una sola consulta: la lista de eventos del productor
-- las suma a las reservas en curso para mostrar el avance real. No cuenta entradas anuladas ni reembolsadas.
create or replace function public.get_events_occupancy(target_org uuid)
returns table (event_id uuid, tickets_sold bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select t.event_id, count(*)
  from public.tickets t
  where t.organization_id = target_org and t.status = 'valid'
  group by t.event_id;
end;
$$;

revoke all on function public.get_events_occupancy(uuid) from public, anon, authenticated;
grant execute on function public.get_events_occupancy(uuid) to authenticated;

notify pgrst, 'reload schema';
