-- Cucardas sobre los eventos ("Últimas entradas", "Sold out"): el listado público necesita saber cuántas entradas hay y cuántas se vendieron,
-- no solo si queda alguna. Las cuenta una función security definer (el público no lee ticket_types ni ticket_holds), solo de entradas públicas.
create or replace function public.get_event_ticket_counts(target_event uuid)
returns table (tickets_total bigint, tickets_sold bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.quantity), 0)::bigint,
    coalesce(sum(least(t.quantity, coalesce(h.held, 0))), 0)::bigint
  from public.ticket_types t
  join public.events e on e.id = t.event_id and e.status in ('published', 'sold_out') and e.tickets_enabled
  left join lateral (
    select sum(x.quantity) as held from public.ticket_holds x
    where x.ticket_type_id = t.id and (x.status = 'consumed' or (x.status = 'active' and x.expires_at > now()))
  ) h on true
  where t.event_id = target_event and t.active and t.publicly_available and not t.link_only;
$$;
revoke all on function public.get_event_ticket_counts(uuid) from public, anon, authenticated;
grant execute on function public.get_event_ticket_counts(uuid) to anon, authenticated, service_role;

drop function public.get_public_events_discovery();

create function public.get_public_events_discovery()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  cover_image_url text,
  starts_at timestamptz,
  currency char(3),
  venue_name text,
  venue_address text,
  city text,
  province text,
  timezone text,
  from_price_amount bigint,
  has_availability boolean,
  discovery_category public.event_discovery_category,
  latitude double precision,
  longitude double precision,
  tickets_total bigint,
  tickets_sold bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id, e.slug, e.name, e.description, e.cover_image_url, e.starts_at, e.currency,
    v.name, v.address, v.city, v.province, v.timezone,
    least(
      ticket_inventory.from_price,
      least(table_inventory.from_price, seat_inventory.from_price)
    ),
    coalesce(ticket_inventory.available, false)
      or coalesce(table_inventory.available, false)
      or coalesce(seat_inventory.available, false),
    e.discovery_category,
    v.latitude, v.longitude,
    counts.tickets_total, counts.tickets_sold
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join lateral (
    select min(t.price_amount) filter (where t.sale_open and t.price_amount > 0) as from_price,
      coalesce(bool_or(t.sale_open), false) as available
    from public.get_public_ticket_types(e.id) t
  ) ticket_inventory on true
  left join lateral (
    select min(t.base_price_amount) filter (
        where t.availability_status = 'available' and t.base_price_amount > 0
      ) as from_price,
      coalesce(bool_or(t.availability_status = 'available'), false) as available
    from public.get_public_event_tables(e.id) t
  ) table_inventory on true
  left join lateral (
    select min(t.base_price_amount) filter (
        where t.availability_status = 'available' and t.base_price_amount > 0
      ) as from_price,
      coalesce(bool_or(t.availability_status = 'available'), false) as available
    from public.get_public_event_seats(e.id) t
  ) seat_inventory on true
  left join lateral public.get_event_ticket_counts(e.id) counts on true
  where e.status in ('published', 'sold_out') and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;
