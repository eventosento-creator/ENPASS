-- Marcar el ingreso de una persona a mano desde el panel (Invitados), para cuando no hay QR que
-- escanear (se quedó sin celular, pagó en efectivo, etc.). Queda registrado como un ingreso
-- 'manual' en checkins, igual que los del scanner, así cuenta en las métricas de acceso y el
-- scanner después lo ve como ya usado (no se puede entrar dos veces con la misma entrada).
-- Y se puede deshacer si se marcó por error (solo las marcas hechas desde el panel).

create function public.mark_ticket_entry(target_ticket uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ticket_row public.tickets;
  entry_number_value integer;
  created_checkin uuid;
begin
  select * into ticket_row from public.tickets where id = target_ticket for update;
  if not found or auth.uid() is null
    or not (public.can_manage_org(ticket_row.organization_id) or public.can_manage_event(ticket_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if ticket_row.status <> 'valid' then
    raise exception 'TICKET_NOT_VALID' using errcode = 'P0001';
  end if;
  if ticket_row.used_entries >= ticket_row.max_entries then
    raise exception 'ALREADY_USED' using errcode = 'P0001';
  end if;
  entry_number_value := ticket_row.used_entries + 1;
  update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
  insert into public.checkins (organization_id, event_id, ticket_id, result, source, entry_number, idempotency_key, scanned_at)
  values (ticket_row.organization_id, ticket_row.event_id, ticket_row.id, 'valid', 'manual', entry_number_value, gen_random_uuid(), now())
  returning id into created_checkin;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (ticket_row.organization_id, auth.uid(), 'access.manual_entry.marked', 'ticket', ticket_row.id,
    jsonb_build_object('checkin_id', created_checkin, 'entry_number', entry_number_value));
  return jsonb_build_object('checkin_id', created_checkin, 'entry_number', entry_number_value, 'used_entries', entry_number_value, 'max_entries', ticket_row.max_entries);
end;
$$;

-- Deshace la última marca manual hecha desde el panel (no toca ingresos que leyó un scanner).
create function public.undo_ticket_entry(target_ticket uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ticket_row public.tickets;
  last_manual public.checkins;
begin
  select * into ticket_row from public.tickets where id = target_ticket for update;
  if not found or auth.uid() is null
    or not (public.can_manage_org(ticket_row.organization_id) or public.can_manage_event(ticket_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into last_manual from public.checkins c
  where c.ticket_id = ticket_row.id and c.result = 'valid' and c.source = 'manual'
    and c.scanner_session_id is null and not c.override and c.override_of_checkin_id is null
  order by c.scanned_at desc limit 1 for update;
  if not found or ticket_row.used_entries < 1 then
    raise exception 'NOTHING_TO_UNDO' using errcode = 'P0001';
  end if;
  delete from public.checkins where id = last_manual.id;
  update public.tickets set used_entries = ticket_row.used_entries - 1 where id = ticket_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (ticket_row.organization_id, auth.uid(), 'access.manual_entry.undone', 'ticket', ticket_row.id,
    jsonb_build_object('checkin_id', last_manual.id));
  return jsonb_build_object('used_entries', ticket_row.used_entries - 1, 'max_entries', ticket_row.max_entries);
end;
$$;

revoke all on function public.mark_ticket_entry(uuid), public.undo_ticket_entry(uuid) from public, anon, authenticated;
grant execute on function public.mark_ticket_entry(uuid), public.undo_ticket_entry(uuid) to authenticated;

-- La lista de Invitados lee estas dos columnas (a qué mesa/asiento corresponde cada entrada). No son
-- datos sensibles; las columnas del QR siguen bloqueadas. Si ya tenían permiso, esto no cambia nada.
grant select (event_table_id, event_seat_id) on public.tickets to authenticated;
