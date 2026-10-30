-- Hora límite de ingreso por tipo de entrada ("Stop 1 am" para las gratis, "Stop 2:30 am" para las pagas).
-- El corte se guarda como hora del día en la zona horaria del evento y se traduce a la validez de cada entrada (tickets.valid_until):
-- el scanner ya rechaza con "FUERA DE HORARIO" lo que llega después de valid_until, así que no hace falta tocar check_in_ticket.
-- Como las entradas se emiten por un solo camino y el evento puede cambiar de horario, el recorte vive en un trigger de tickets.

alter table public.ticket_types add column if not exists entry_cutoff_time time;

-- Primer momento con esa hora del día (en la zona del evento) posterior a "from_ts".
-- Ej.: puertas 23:00 y corte 02:30 -> 02:30 del día siguiente; puertas 20:00 y corte 21:00 -> 21:00 del mismo día.
create or replace function public.next_local_time_after(from_ts timestamptz, local_time time, tz text)
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when ((from_ts at time zone tz)::date + local_time) at time zone tz > from_ts
      then ((from_ts at time zone tz)::date + local_time) at time zone tz
    else (((from_ts at time zone tz)::date + 1) + local_time) at time zone tz
  end;
$$;

create or replace function public.apply_ticket_entry_cutoff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cutoff time;
  tz text;
begin
  if new.ticket_type_id is null then return new; end if;
  select tt.entry_cutoff_time, v.timezone into cutoff, tz
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  join public.venues v on v.id = e.venue_id
  where tt.id = new.ticket_type_id;
  if cutoff is not null then
    -- El corte solo recorta: nunca extiende la validez más allá del fin del evento.
    new.valid_until := least(new.valid_until, public.next_local_time_after(new.valid_from, cutoff, tz));
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_apply_entry_cutoff on public.tickets;
create trigger tickets_apply_entry_cutoff
  before insert or update of valid_from, valid_until, ticket_type_id on public.tickets
  for each row execute function public.apply_ticket_entry_cutoff();

-- Si el productor cambia (o quita) el corte, las entradas ya vendidas lo siguen: se restablece la validez base del evento
-- y el trigger de arriba aplica el corte nuevo.
create or replace function public.refresh_ticket_entry_cutoff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.entry_cutoff_time is distinct from old.entry_cutoff_time then
    update public.tickets t
    set valid_until = coalesce(e.ends_at, e.starts_at + interval '12 hours')
    from public.events e
    where t.ticket_type_id = new.id and e.id = t.event_id and t.status = 'valid';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_types_refresh_entry_cutoff on public.ticket_types;
create trigger ticket_types_refresh_entry_cutoff
  after update of entry_cutoff_time on public.ticket_types
  for each row execute function public.refresh_ticket_entry_cutoff();

revoke execute on function public.apply_ticket_entry_cutoff() from public, anon, authenticated;
revoke execute on function public.refresh_ticket_entry_cutoff() from public, anon, authenticated;
