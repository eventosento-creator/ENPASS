-- Marcar un evento como "Agotado" lo sacaba por completo de /eventos, del banner y hasta
-- de su propio link directo (404), como si nunca hubiera existido. Debería seguir visible
-- (mostrando "Agotado", sin poder comprar) en vez de desaparecer. Las funciones que listan
-- entradas/mesas/asientos comprables (get_public_ticket_types, get_public_event_tables,
-- get_public_event_seats) ya exigen status = 'published' puertas adentro, así que un evento
-- agotado sigue sin mostrar nada comprable — esto solo afecta si la PÁGINA del evento y su
-- entrada en el listado existen o no.

drop function public.get_public_event_by_slug(text);

create function public.get_public_event_by_slug(target_slug text)
returns table (
  id uuid, venue_id uuid, name text, slug text, description text, cover_image_url text,
  starts_at timestamptz, doors_open_at timestamptz, ends_at timestamptz,
  capacity integer, require_document boolean, currency char(3),
  tickets_enabled boolean, tables_enabled boolean
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.venue_id, e.name, e.slug, e.description, e.cover_image_url,
    e.starts_at, e.doors_open_at, e.ends_at, e.capacity, e.require_document,
    e.currency, e.tickets_enabled, e.tables_enabled
  from public.events e where e.slug = target_slug and e.status in ('published', 'sold_out');
$$;

revoke all on function public.get_public_event_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;

create or replace function public.get_public_events_discovery()
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
  discovery_category public.event_discovery_category
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
    e.discovery_category
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
