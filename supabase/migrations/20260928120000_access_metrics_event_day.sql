-- get_event_access_metrics filtraba por "hoy" (el día en que se mira la pantalla), así que
-- al otro día del evento las tarjetas de Accesos volvían a 0 aunque hubo ingresos reales.
-- Ahora filtra por el día del evento (starts_at en el huso horario del lugar), que es fijo
-- y no depende de cuándo lo mirás.
create or replace function public.get_event_access_metrics(target_event uuid)
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
  event_day date;
begin
  select e.* into event_row from public.events e where e.id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select v.timezone into venue_timezone from public.venues v where v.id = event_row.venue_id;
  event_day := (event_row.starts_at at time zone venue_timezone)::date;
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
    and (c.scanned_at at time zone venue_timezone)::date = event_day;
end;
$$;
