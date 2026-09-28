-- Borrar evento (distinto de cancelar): borra el evento y todo lo que cuelga de él, pero
-- solo si nunca se vendió ni se emitió una sola entrada. Si hubo aunque sea una venta, la
-- única opción sigue siendo "Cancelar evento" — un evento con historial de venta no se borra,
-- se anula, mismo criterio que ya seguimos en toda la ticketera (ledger, taquilla, etc.).
--
-- El borrado explícito de las tablas con "on delete restrict" hacia events/orders es
-- necesario porque esas dos son, a propósito, las únicas que no cascadean (para que un
-- delete accidental de un evento CON ventas reales explote con un error de FK en vez de
-- borrar plata silenciosamente). El resto de las tablas hijas de events sí son "on delete
-- cascade" y se limpian solas.
create function public.delete_event(target_event uuid)
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

  if exists (select 1 from public.tickets t where t.event_id = target_event)
    or exists (select 1 from public.orders o where o.event_id = target_event and o.status in ('paid', 'refunded')) then
    raise exception 'EVENT_HAS_SALES' using errcode = 'P0001';
  end if;

  -- Hijos de orders (restrict) — las orders de este evento a esta altura son todas
  -- pending/expired/cancelled, sin ninguna venta real detrás.
  delete from public.payments where order_id in (select id from public.orders where event_id = target_event);
  delete from public.invoices where order_id in (select id from public.orders where event_id = target_event);
  delete from public.legal_acceptances where order_id in (select id from public.orders where event_id = target_event);
  delete from public.arrepentimiento_requests where order_id in (select id from public.orders where event_id = target_event);

  -- Hijos directos de events con restrict.
  delete from public.promoter_commissions where event_id = target_event;
  delete from public.entitlements where event_id = target_event;
  delete from public.table_holds where event_id = target_event;
  delete from public.seat_holds where event_id = target_event;
  delete from public.ticket_holds where event_id = target_event;
  delete from public.ticket_deliveries where event_id = target_event;
  delete from public.tickets where event_id = target_event;
  delete from public.pos_cash_movements where event_id = target_event;
  delete from public.pos_sessions where event_id = target_event;

  delete from public.orders where event_id = target_event;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data)
  values (event_row.organization_id, auth.uid(), 'event.deleted', 'event', target_event, jsonb_build_object('name', event_row.name, 'slug', event_row.slug));

  -- El resto (ticket_types, sale_phases, access_gates+hijos, scanner_*, event_promoters,
  -- event_products, sales_locations+hijos, pos_device_*, box_office_*, event_collaborators,
  -- checkins, favoritos de descubrimiento) es on delete cascade y se borra solo acá.
  delete from public.events where id = target_event;
end;
$$;

revoke all on function public.delete_event(uuid) from public, anon, authenticated;
grant execute on function public.delete_event(uuid) to authenticated;
