-- Restaura la guarda OPEN_POS_SESSIONS en update_event_configuration: la migración de mapas de butacas (fase 7) redefinió la función
-- con un parámetro más y la dejó sin la guarda, por lo que se podía apagar la caja con cajas abiertas. La app ya muestra el mensaje
-- "Cerrá las cajas abiertas antes de desactivar la caja" cuando la base devuelve este error.

create or replace function public.update_event_configuration(target_event uuid, target_profile event_profile, target_tickets_enabled boolean, target_promoters_enabled boolean, target_tables_enabled boolean, target_access_enabled boolean, target_pos_enabled boolean, target_inventory_enabled boolean, target_seatmap_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_row public.events;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  -- No se puede apagar la caja mientras haya una caja abierta (esta guarda existía desde la fase 6 y se perdió al redefinir la función en la fase 7).
  if event_row.pos_enabled and not target_pos_enabled and exists (
    select 1 from public.pos_sessions where event_id = target_event and status = 'open'
  ) then raise exception 'OPEN_POS_SESSIONS' using errcode = 'P0001'; end if;

  update public.events set
    profile = target_profile,
    tickets_enabled = target_tickets_enabled,
    promoters_enabled = target_promoters_enabled,
    tables_enabled = target_tables_enabled,
    access_enabled = target_access_enabled,
    pos_enabled = target_pos_enabled,
    inventory_enabled = target_inventory_enabled,
    seatmap_enabled = target_seatmap_enabled
  where id = target_event;

  if event_row.profile is distinct from target_profile then
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      event_row.organization_id, auth.uid(), 'event.profile.updated', 'event', target_event,
      jsonb_build_object('profile', event_row.profile), jsonb_build_object('profile', target_profile)
    );
  end if;
  if event_row.tickets_enabled is distinct from target_tickets_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tickets_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'tickets'));
  end if;
  if event_row.promoters_enabled is distinct from target_promoters_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_promoters_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'promoters'));
  end if;
  if event_row.tables_enabled is distinct from target_tables_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_tables_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'tables'));
  end if;
  if event_row.access_enabled is distinct from target_access_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_access_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'access'));
  end if;
  if event_row.seatmap_enabled is distinct from target_seatmap_enabled then
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (event_row.organization_id, auth.uid(), case when target_seatmap_enabled then 'event.capability.enabled' else 'event.capability.disabled' end,
      'event', target_event, jsonb_build_object('capability', 'seatmap'));
  end if;
end;
$function$;

notify pgrst, 'reload schema';
