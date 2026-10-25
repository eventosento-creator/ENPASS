-- Que ninguna entrada quede sin puerta: un tipo de entrada nuevo (común, por link, de taquilla, de RRPP) queda aceptado en todas
-- las puertas del evento, y el productor puede arreglar con un toque los tipos que hayan quedado sin puerta.
-- Antes un tipo creado DESPUÉS de las puertas no se aceptaba en ninguna y el scanner respondía "PUERTA INCORRECTA" en plena fila.

-- 1) Tipos nuevos: aceptados por defecto en todas las puertas del evento (el productor destilda donde no corresponda).
create or replace function public.accept_new_ticket_type_at_gates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select g.id, new.id, new.organization_id, new.event_id
  from public.access_gates g
  where g.event_id = new.event_id and g.organization_id = new.organization_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.accept_new_ticket_type_at_gates() from public, anon, authenticated;

drop trigger if exists ticket_types_accept_at_gates on public.ticket_types;
create trigger ticket_types_accept_at_gates after insert on public.ticket_types
  for each row execute function public.accept_new_ticket_type_at_gates();

-- 2) Arreglo con un toque: si el evento no tiene ninguna puerta crea "Acceso principal" con todos los tipos activos; si tiene,
--    habilita en TODAS las puertas operativas los tipos activos que hoy no pasan por ninguna.
create or replace function public.fix_event_gate_coverage(target_event uuid)
returns table (gate_created boolean, rules_added integer)
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events;
  gate_id uuid;
  added integer := 0;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not (public.can_manage_org(event_row.organization_id) or public.can_manage_event(event_row.id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.access_gates g where g.event_id = target_event) then
    if not exists (select 1 from public.ticket_types tt where tt.event_id = target_event and tt.active) then
      raise exception 'NO_TICKET_TYPES' using errcode = 'P0001';
    end if;
    insert into public.access_gates (organization_id, event_id, name, description)
    values (event_row.organization_id, event_row.id, 'Acceso principal', 'Creada automáticamente: acepta todas las entradas')
    returning id into gate_id;
    insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
    select gate_id, tt.id, event_row.organization_id, event_row.id from public.ticket_types tt where tt.event_id = target_event and tt.active;
    get diagnostics added = row_count;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), 'access.gate.created', 'access_gate', gate_id, jsonb_build_object('event_id', event_row.id, 'auto', true));
    return query select true, added;
    return;
  end if;

  if not exists (select 1 from public.access_gates g where g.event_id = target_event and g.active) then
    raise exception 'NO_ACTIVE_GATES' using errcode = 'P0001';
  end if;

  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select g.id, tt.id, event_row.organization_id, event_row.id
  from public.ticket_types tt
  join public.access_gates g on g.event_id = tt.event_id and g.active
  where tt.event_id = target_event and tt.active
    and not exists (
      select 1 from public.access_gate_ticket_types r join public.access_gates rg on rg.id = r.access_gate_id and rg.active
      where r.ticket_type_id = tt.id
    )
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), 'access.gate_coverage.fixed', 'event', event_row.id, jsonb_build_object('rules_added', added));
  end if;
  return query select false, added;
end;
$$;

revoke all on function public.fix_event_gate_coverage(uuid) from public, anon, authenticated;
grant execute on function public.fix_event_gate_coverage(uuid) to authenticated;

notify pgrst, 'reload schema';
