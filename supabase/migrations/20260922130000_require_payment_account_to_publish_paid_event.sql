-- No dejar publicar un evento con entradas/mesas pagas si la organización todavía no
-- conectó Mercado Pago: hoy el organizador podía publicar igual, y el comprador recién se
-- enteraba de que no podía pagar al llegar al checkout. Ahora se bloquea antes, en el
-- momento de publicar, con un mensaje claro.

create or replace function public.publish_event(target_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  event_row public.events;
  configured_capacity bigint;
  has_paid_inventory boolean;
  has_connected_account boolean;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or not public.can_manage_org(event_row.organization_id) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  if event_row.starts_at <= now() then raise exception 'EVENT_MUST_BE_FUTURE' using errcode = 'P0001'; end if;
  if event_row.tickets_enabled and not exists (
    select 1 from public.ticket_types t where t.event_id = target_event and t.active and t.quantity > 0
  ) then raise exception 'TICKET_TYPE_REQUIRED' using errcode = 'P0001'; end if;
  if event_row.tables_enabled and not event_row.tickets_enabled and not exists (
    select 1 from public.event_tables et where et.event_id = target_event and et.active
  ) and not (event_row.seatmap_enabled and exists (
    select 1 from public.event_seats es join public.seat_map_sections s on s.id = es.section_id
    where es.event_id = target_event and es.active and s.active
  )) then raise exception 'TABLE_REQUIRED' using errcode = 'P0001'; end if;
  if event_row.seatmap_enabled and not event_row.tickets_enabled and not event_row.tables_enabled and not exists (
    select 1 from public.event_seats es join public.seat_map_sections s on s.id = es.section_id
    where es.event_id = target_event and es.active and s.active
  ) then raise exception 'SEAT_MAP_REQUIRED' using errcode = 'P0001'; end if;
  select
    case when event_row.tickets_enabled then coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = target_event and t.active), 0) else 0 end
    + case when event_row.tables_enabled then coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = target_event and et.active), 0) else 0 end
    + case when event_row.seatmap_enabled then coalesce((select count(*) from public.event_seats es
        join public.seat_map_sections s on s.id = es.section_id
        where es.event_id = target_event and es.active and s.active), 0) else 0 end
  into configured_capacity;
  if configured_capacity > event_row.capacity then raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001'; end if;

  select
    (event_row.tickets_enabled and exists (
      select 1 from public.ticket_types t where t.event_id = target_event and t.active and t.price_amount > 0
    ))
    or (event_row.tables_enabled and exists (
      select 1 from public.event_tables et where et.event_id = target_event and et.active and et.base_price_amount > 0
    ))
    or (event_row.seatmap_enabled and exists (
      select 1 from public.event_seats es join public.seat_map_sections s on s.id = es.section_id
      where es.event_id = target_event and es.active and s.active and s.base_price_amount > 0
    ))
  into has_paid_inventory;
  if has_paid_inventory then
    select exists (
      select 1 from public.payment_accounts pa
      where pa.organization_id = event_row.organization_id and pa.provider = 'mercado_pago' and pa.status = 'connected'
    ) into has_connected_account;
    if not has_connected_account then
      raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  update public.events set status = 'published', published_at = now() where id = target_event;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (event_row.organization_id, auth.uid(), 'event.published', 'event', target_event);
end;
$$;

revoke all on function public.publish_event(uuid) from public, anon, authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
