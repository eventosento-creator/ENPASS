-- Reportes del productor: UNA función que devuelve todo el dashboard ya agregado (no se traen filas
-- al frontend). Solo pueden leerla quienes gestionan la organización (can_manage_org, que ya cubre
-- a los admins de plataforma), y todo se filtra por organization_id dentro de la función: no depende
-- de filtros del frontend.
--
-- Definiciones (acordadas con el producto):
--  * Facturación bruta = suma de los ítems (entrada / mesa / asiento) de órdenes PAGADAS que no son
--    cortesía, sin el cargo por servicio y sin la caja de bar (channel 'pos'). Las órdenes
--    canceladas, vencidas, pendientes o reembolsadas no entran (status = 'paid').
--  * Operaciones = órdenes pagadas con importe > 0. Ticket promedio = facturación / operaciones.
--  * Entradas = tickets de esas órdenes; una mesa cuenta por su capacidad (personas).
--  * Cortesías = órdenes is_courtesy: suman entradas, nunca dinero.
--  * Origen: Mesas (ítem de mesa) > Taquilla (channel box_office) > RRPP (orden con promoter) > Directas.
--  * Ocupación = entradas emitidas (vendidas + cortesías + gratis, mesas por capacidad) / capacidad
--    del evento, igual que la barra "Vendido" del resumen de cada evento.
--  * Asistencia = tickets con al menos un ingreso / tickets válidos de los eventos que ocurren en el período.
--  * La fecha de venta es orders.created_at (las órdenes no guardan paid_at; el pago es inmediato).
--  * Zona horaria fija America/Argentina/Buenos_Aires para agrupar por hora/día/semana/mes.

create index if not exists orders_org_paid_created_idx on public.orders (organization_id, created_at) where status = 'paid';

create function public.get_org_report(
  target_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_event uuid default null,
  p_group text default 'day',
  p_channel text default null,
  p_city text default null,
  p_status text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  grp text;
  prev_from timestamptz;
  result jsonb;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_to <= p_from or p_to - p_from > interval '800 days' then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;
  grp := case when p_group in ('hour', 'day', 'week', 'month') then p_group else 'day' end;
  prev_from := p_from - (p_to - p_from);

  with
  scope_events as (
    select e.id, e.name, e.starts_at, e.capacity, e.cover_image_url, e.status, v.city
    from public.events e join public.venues v on v.id = e.venue_id
    where e.organization_id = target_org
      and (p_event is null or e.id = p_event)
      and (p_status is null or e.status::text = p_status)
      and (p_city is null or lower(v.city) = lower(p_city))
  ),
  orders_in as (
    select o.id, o.event_id, o.customer_id, o.created_at, o.channel, o.is_courtesy, o.promoter_id, (o.created_at >= p_from) as is_current
    from public.orders o join scope_events se on se.id = o.event_id
    where o.organization_id = target_org and o.status = 'paid' and o.channel <> 'pos'
      and o.created_at >= prev_from and o.created_at < p_to
      and (p_channel is null
        or (p_channel = 'online' and o.channel in ('ticket_web', 'admin'))
        or (p_channel = 'box_office' and o.channel = 'box_office'))
  ),
  order_rev as (
    select oi.order_id, sum(oi.line_total_amount)::bigint as amount, bool_or(oi.item_type = 'table') as has_table
    from public.order_items oi join orders_in oin on oin.id = oi.order_id
    where oi.item_type in ('ticket', 'table', 'seat')
    group by oi.order_id
  ),
  paid as (
    select oin.*, r.amount, r.has_table,
      case when r.has_table then 'tables' when oin.channel = 'box_office' then 'box_office' when oin.promoter_id is not null then 'rrpp' else 'direct' end as origin
    from orders_in oin join order_rev r on r.order_id = oin.id
    where not oin.is_courtesy and r.amount > 0
  ),
  courtesy as (select oin.* from orders_in oin where oin.is_courtesy and oin.is_current),
  tix as (
    select t.id, t.order_id, t.event_id, t.ticket_type_id, t.event_table_id,
      case when t.event_table_id is not null then coalesce(et.capacity, 1) else 1 end as units
    from public.tickets t
    join orders_in oin on oin.id = t.order_id
    left join public.event_tables et on et.id = t.event_table_id
    where t.status = 'valid'
  ),
  paid_tix as (select x.*, p.is_current, p.origin, p.created_at, p.promoter_id from tix x join paid p on p.id = x.order_id),
  kpi_cur as (
    select coalesce(sum(p.amount), 0)::bigint as revenue, count(*)::bigint as ops, count(distinct p.customer_id)::bigint as buyers,
      (select coalesce(sum(pt.units), 0) from paid_tix pt where pt.is_current)::bigint as units
    from paid p where p.is_current
  ),
  kpi_prev as (
    select coalesce(sum(p.amount), 0)::bigint as revenue, count(*)::bigint as ops, count(distinct p.customer_id)::bigint as buyers,
      (select coalesce(sum(pt.units), 0) from paid_tix pt where not pt.is_current)::bigint as units
    from paid p where not p.is_current
  ),
  active_events as (
    select se.* from scope_events se
    where p_event is not null
      or exists (select 1 from orders_in oin where oin.event_id = se.id and oin.is_current)
  ),
  issued_all as (
    select t.event_id, coalesce(sum(case when t.event_table_id is not null then coalesce(et.capacity, 1) else 1 end), 0)::bigint as units
    from public.tickets t
    left join public.event_tables et on et.id = t.event_table_id
    where t.event_id in (select id from active_events) and t.status = 'valid'
    group by t.event_id
  ),
  series_money as (
    select date_trunc(grp, p.created_at at time zone tz) as bucket,
      sum(p.amount)::bigint as revenue, count(*)::bigint as ops, count(distinct p.customer_id)::bigint as buyers
    from paid p where p.is_current group by 1
  ),
  series_units as (
    select date_trunc(grp, pt.created_at at time zone tz) as bucket, sum(pt.units)::bigint as units
    from paid_tix pt where pt.is_current group by 1
  ),
  series as (
    select m.bucket, m.revenue, m.ops, m.buyers, coalesce(u.units, 0)::bigint as units
    from series_money m left join series_units u on u.bucket = m.bucket
  ),
  origin as (
    select p.origin, sum(p.amount)::bigint as revenue,
      (select coalesce(sum(pt.units), 0) from paid_tix pt where pt.is_current and pt.origin = p.origin)::bigint as units
    from paid p where p.is_current group by p.origin
  ),
  events_rows as (
    select ae.id, ae.name, ae.starts_at, ae.cover_image_url, ae.capacity,
      coalesce((select sum(p.amount) from paid p where p.is_current and p.event_id = ae.id), 0)::bigint as revenue,
      coalesce((select sum(pt.units) from paid_tix pt where pt.is_current and pt.event_id = ae.id), 0)::bigint as units,
      (select count(*) from paid p where p.is_current and p.event_id = ae.id)::bigint as ops,
      coalesce((select ia.units from issued_all ia where ia.event_id = ae.id), 0)::bigint as issued
    from active_events ae
  ),
  rrpp_rows as (
    select pr.id, pr.display_name,
      sum(p.amount)::bigint as revenue,
      (select coalesce(sum(pt.units), 0) from paid_tix pt where pt.is_current and pt.promoter_id = pr.id)::bigint as units
    from paid p join public.promoters pr on pr.id = p.promoter_id
    where p.is_current group by pr.id, pr.display_name
  ),
  type_rows as (
    select tt.name,
      sum(tt.quantity)::bigint as quantity,
      coalesce(sum((select count(*) from public.tickets t where t.ticket_type_id = tt.id and t.status = 'valid')), 0)::bigint as issued_all,
      coalesce(sum((select count(*) from paid_tix pt where pt.ticket_type_id = tt.id and pt.is_current)), 0)::bigint as sold,
      coalesce(sum((select sum(oi.line_total_amount) from public.order_items oi join paid p on p.id = oi.order_id where p.is_current and oi.ticket_type_id = tt.id and oi.item_type = 'ticket')), 0)::bigint as revenue
    from public.ticket_types tt
    where tt.event_id in (select id from scope_events)
    group by tt.name
  ),
  happening as (
    select se.id from scope_events se where p_event is not null or (se.starts_at >= p_from and se.starts_at < p_to)
  ),
  access_tix as (
    select count(*)::bigint as issued, count(*) filter (where t.used_entries > 0)::bigint as entered
    from public.tickets t where t.event_id in (select id from happening) and t.status = 'valid'
  ),
  hourly as (
    select extract(hour from c.scanned_at at time zone tz)::int as h, count(*)::bigint as n
    from public.checkins c
    where c.event_id in (select id from happening) and c.result = 'valid'
    group by 1
  ),
  channel_rows as (
    select case when p.channel = 'box_office' then 'box_office' else 'online' end as channel, sum(p.amount)::bigint as revenue
    from paid p where p.is_current group by 1
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'group', grp),
    'kpis', jsonb_build_object(
      'current', (select to_jsonb(k) from kpi_cur k),
      'previous', (select to_jsonb(k) from kpi_prev k),
      'occupancy', (select case when sum(er.capacity) > 0 then round(100.0 * sum(er.issued) / sum(er.capacity), 1) else null end from events_rows er),
      'courtesy_tickets', (select coalesce(sum(t.units), 0) from (select case when x.event_table_id is not null then coalesce(et.capacity, 1) else 1 end as units
        from public.tickets x join courtesy c on c.id = x.order_id left join public.event_tables et on et.id = x.event_table_id where x.status = 'valid') t)
    ),
    'series', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(s.bucket, 'YYYY-MM-DD"T"HH24:MI:SS'), 'revenue', s.revenue, 'units', s.units, 'ops', s.ops, 'buyers', s.buyers) order by s.bucket) from series s), '[]'::jsonb),
    'origin', coalesce((select jsonb_agg(jsonb_build_object('key', o.origin, 'revenue', o.revenue, 'units', o.units)) from origin o), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', er.id, 'name', er.name, 'starts_at', er.starts_at, 'cover', er.cover_image_url, 'revenue', er.revenue, 'units', er.units, 'ops', er.ops, 'capacity', er.capacity, 'issued', er.issued) order by er.revenue desc) from (select * from events_rows order by revenue desc limit 50) er), '[]'::jsonb),
    'rrpp', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.display_name, 'revenue', r.revenue, 'units', r.units) order by r.revenue desc) from (select * from rrpp_rows order by revenue desc limit 10) r), '[]'::jsonb),
    'ticket_types', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.quantity, 'issued', t.issued_all, 'sold', t.sold, 'revenue', t.revenue) order by t.revenue desc, t.sold desc) from type_rows t where t.sold > 0 or t.issued_all > 0), '[]'::jsonb),
    'access', jsonb_build_object(
      'issued', (select issued from access_tix), 'entered', (select entered from access_tix),
      'hourly', coalesce((select jsonb_agg(jsonb_build_object('hour', h.h, 'count', h.n) order by h.h) from hourly h), '[]'::jsonb)),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('key', c.channel, 'revenue', c.revenue)) from channel_rows c), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
revoke all on function public.get_org_report(uuid, timestamptz, timestamptz, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_org_report(uuid, timestamptz, timestamptz, uuid, text, text, text, text) to authenticated;
