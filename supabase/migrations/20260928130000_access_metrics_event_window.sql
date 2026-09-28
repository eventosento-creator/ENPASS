-- El intento anterior (20260928120000) comparaba por fecha de calendario del día de
-- starts_at. Rompe en cualquier evento que arranque tarde (ej. 23:59) y la gente entre
-- ya pasada la medianoche: los check-ins quedan fechados al día siguiente y no matchean.
-- Ahora se usa una ventana de horario real del evento: desde que abren puertas (con margen)
-- hasta que termina (con margen), sin depender de en qué día calendario cae cada cosa.
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
  window_start timestamptz;
  window_end timestamptz;
begin
  select e.* into event_row from public.events e where e.id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  window_start := coalesce(event_row.doors_open_at, event_row.starts_at) - interval '3 hours';
  window_end := coalesce(event_row.ends_at, event_row.starts_at) + interval '12 hours';
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
    and c.scanned_at >= window_start and c.scanned_at <= window_end;
end;
$$;
