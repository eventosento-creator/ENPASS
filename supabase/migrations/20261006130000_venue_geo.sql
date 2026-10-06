-- Ubicación de los lugares (venues) para mostrar primero los eventos más cercanos.
-- Las coordenadas se completan solas (geocodificando la dirección) y se borran si la dirección cambia.
alter table public.venues
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180),
  add column if not exists geocode_attempted_at timestamptz;

-- El proceso en segundo plano (service_role) solo puede escribir estas tres columnas.
grant update (latitude, longitude, geocode_attempted_at) on public.venues to service_role;

create or replace function public.venues_reset_geocode()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.address is distinct from old.address or new.city is distinct from old.city or new.province is distinct from old.province then
    new.latitude := null; new.longitude := null; new.geocode_attempted_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists venues_reset_geocode on public.venues;
create trigger venues_reset_geocode before update on public.venues for each row execute function public.venues_reset_geocode();

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
  longitude double precision
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
    v.latitude, v.longitude
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
  where e.status in ('published', 'sold_out') and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;
