create index if not exists events_published_starts_at_idx
on public.events (starts_at)
where status = 'published';

alter table public.ticket_types
add column publicly_available boolean not null default true;

create or replace function public.get_public_ticket_types(target_event uuid)
returns table (
  id uuid, organization_id uuid, event_id uuid, name text, description text,
  price_amount bigint, currency char(3), quantity integer, max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, active boolean, sort_order integer,
  available_quantity bigint, sale_open boolean
) language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      greatest(t.quantity - coalesce(sum(h.quantity) filter (where h.status = 'active' and h.expires_at > now()), 0), 0)::bigint as available,
      coalesce(p.sort_order, t.sort_order) as phase_order
    from public.ticket_types t
    left join public.sale_phases p on p.id = t.sale_phase_id
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published'
    where t.event_id = target_event and t.active and t.publicly_available
    group by t.id, p.sort_order
  ), open_phase as (
    select min(phase_order) as phase_order from inventory where available > 0
  )
  select i.id, i.organization_id, i.event_id, i.name, i.description, i.price_amount, i.currency,
    i.quantity, i.max_per_order, i.sales_start, i.sales_end, i.active, i.sort_order, i.available,
    (i.available > 0 and i.phase_order = o.phase_order and (i.sales_start is null or i.sales_start <= now()) and (i.sales_end is null or i.sales_end > now()))
  from inventory i cross join open_phase o
  order by i.phase_order, i.sort_order;
$$;

alter function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb)
rename to create_guest_checkout_internal;
revoke all on function public.create_guest_checkout_internal(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;

create function public.create_guest_checkout(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb
) returns table (order_public_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(selections) = 'array' and exists (
    select 1
    from jsonb_array_elements(selections) selection
    left join public.ticket_types t on t.id = (selection->>'ticket_type_id')::uuid
    where not coalesce(t.publicly_available, false)
  ) then
    raise exception 'INVALID_SELECTION' using errcode = 'P0001';
  end if;

  return query
  select * from public.create_guest_checkout_internal(
    target_event,
    buyer_first_name,
    buyer_last_name,
    buyer_email,
    buyer_phone,
    buyer_document,
    selections
  );
end;
$$;

revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) to anon, authenticated;

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
  has_availability boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.slug,
    e.name,
    e.description,
    e.cover_image_url,
    e.starts_at,
    e.currency,
    v.name,
    v.address,
    v.city,
    v.province,
    v.timezone,
    min(t.price_amount) filter (where t.sale_open and t.price_amount > 0),
    coalesce(bool_or(t.sale_open), false)
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join lateral public.get_public_ticket_types(e.id) t on true
  where e.status = 'published'
    and e.starts_at > now()
  group by e.id, v.id
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public;
grant execute on function public.get_public_events_discovery() to anon, authenticated;
