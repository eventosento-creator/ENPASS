-- Cancelar evento (bloquea ventas nuevas, sin reembolso automático) y marcar/desmarcar
-- agotado manualmente. Mismo patrón que publish_event / update_event_details: RPC
-- security definer que valida can_manage_org y solo permite la transición de estado
-- prevista. El bloqueo de ventas es automático porque get_public_ticket_types y
-- get_public_event_by_slug solo devuelven eventos con status = 'published'.

create function public.cancel_event(target_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if event_row.status in ('finished', 'cancelled') then
    raise exception 'EVENT_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  update public.events set status = 'cancelled' where id = target_event;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.cancelled', 'event', target_event);
end;
$$;

revoke all on function public.cancel_event(uuid) from public, anon, authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;

create function public.set_event_sold_out(target_event uuid, target_sold_out boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_sold_out then
    if event_row.status <> 'published' then
      raise exception 'EVENT_NOT_PUBLISHED' using errcode = 'P0001';
    end if;
    update public.events set status = 'sold_out' where id = target_event;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
    values (event_row.organization_id, auth.uid(), 'event.marked_sold_out', 'event', target_event);
  else
    if event_row.status <> 'sold_out' then
      raise exception 'EVENT_NOT_SOLD_OUT' using errcode = 'P0001';
    end if;
    update public.events set status = 'published' where id = target_event;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
    values (event_row.organization_id, auth.uid(), 'event.unmarked_sold_out', 'event', target_event);
  end if;
end;
$$;

revoke all on function public.set_event_sold_out(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_event_sold_out(uuid, boolean) to authenticated;
