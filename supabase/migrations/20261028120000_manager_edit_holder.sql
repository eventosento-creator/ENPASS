-- El productor (o quien administra el evento) puede corregir el titular de una entrada desde Invitados: sirve para las compras
-- anteriores a las entradas nominales (salían con el nombre del comprador) y para errores de tipeo. A diferencia del comprador,
-- puede hacerlo también dentro de las 3 horas previas y con la entrada ya usada; no puede tocar entradas anuladas o reembolsadas.
create or replace function public.update_ticket_holder_as_manager(target_ticket uuid, target_first_name text, target_last_name text, target_document text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ticket_row public.tickets;
  event_row public.events;
  clean_first text := trim(coalesce(target_first_name, ''));
  clean_last text := trim(coalesce(target_last_name, ''));
  clean_doc text := nullif(regexp_replace(coalesce(target_document, ''), '[^0-9]', '', 'g'), '');
begin
  select * into ticket_row from public.tickets where id = target_ticket for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = ticket_row.event_id;
  if auth.uid() is null or not (public.can_manage_org(ticket_row.organization_id) or public.can_manage_event(ticket_row.event_id)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if ticket_row.ticket_type_id is null or ticket_row.status <> 'valid' then raise exception 'NOT_EDITABLE' using errcode = 'P0001'; end if;
  if char_length(clean_first) not between 1 and 80 or char_length(clean_last) not between 1 and 80 then raise exception 'INVALID_NAME' using errcode = 'P0001'; end if;
  if clean_doc is not null and clean_doc !~ '^[0-9]{7,8}$' then raise exception 'INVALID_DOCUMENT' using errcode = 'P0001'; end if;
  if event_row.require_document and clean_doc is null then raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001'; end if;

  update public.tickets set holder_first_name = clean_first, holder_last_name = clean_last,
    holder_document = case when event_row.require_document or clean_doc is not null then clean_doc else holder_document end
  where id = ticket_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (ticket_row.organization_id, auth.uid(), 'ticket.holder.changed', 'ticket', ticket_row.id,
    jsonb_build_object('name', trim(ticket_row.holder_first_name || ' ' || ticket_row.holder_last_name)),
    jsonb_build_object('name', trim(clean_first || ' ' || clean_last), 'event_id', ticket_row.event_id, 'by', 'organizer'));
end;
$$;

revoke all on function public.update_ticket_holder_as_manager(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_ticket_holder_as_manager(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
