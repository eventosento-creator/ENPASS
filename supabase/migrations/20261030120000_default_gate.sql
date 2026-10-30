-- La puerta "Acceso principal" se crea sola: un evento con entradas siempre tiene por dónde entrar.
-- Antes había que crear una puerta a mano (y tildar qué entradas acepta) antes de poder autorizar un scanner; sin ella nadie entraba.
-- Solo se crea cuando el evento NO tiene ninguna puerta: nunca toca las que el productor ya armó.

create or replace function public.ensure_default_gate(target_event uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events;
  gate_id uuid;
begin
  select * into event_row from public.events where id = target_event;
  if not found then return null; end if;
  -- Dos tipos de entrada creados a la vez no deben generar dos puertas.
  perform pg_advisory_xact_lock(hashtext('default_gate:' || target_event::text));
  select g.id into gate_id from public.access_gates g where g.event_id = target_event order by g.created_at limit 1;
  if gate_id is not null then return gate_id; end if;
  insert into public.access_gates (organization_id, event_id, name, description)
  values (event_row.organization_id, event_row.id, 'Acceso principal', 'Creada automáticamente: acepta todas las entradas')
  returning id into gate_id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (event_row.organization_id, 'access.gate.created', 'access_gate', gate_id, jsonb_build_object('event_id', event_row.id, 'auto', true));
  return gate_id;
end;
$$;
revoke all on function public.ensure_default_gate(uuid) from public, anon, authenticated;

-- Tipo de entrada nuevo: asegura que exista al menos una puerta y lo acepta en todas (como antes).
create or replace function public.accept_new_ticket_type_at_gates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_default_gate(new.event_id);
  insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
  select g.id, new.id, new.organization_id, new.event_id
  from public.access_gates g
  where g.event_id = new.event_id and g.organization_id = new.organization_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.accept_new_ticket_type_at_gates() from public, anon, authenticated;

-- Eventos que ya tienen entradas pero ninguna puerta (hoy nadie podría ingresar): se les crea la puerta y se aceptan sus tipos activos.
do $$
declare
  broken record;
  gate_id uuid;
begin
  for broken in
    select e.id from public.events e
    where e.status not in ('finished', 'cancelled')
      and exists (select 1 from public.ticket_types tt where tt.event_id = e.id and tt.active)
      and not exists (select 1 from public.access_gates g where g.event_id = e.id)
  loop
    gate_id := public.ensure_default_gate(broken.id);
    insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
    select gate_id, tt.id, tt.organization_id, tt.event_id from public.ticket_types tt where tt.event_id = broken.id and tt.active
    on conflict do nothing;
  end loop;
end;
$$;
