-- Phase 9: real discovery categories (Fiestas/Recitales/Conferencias/...) and real event favorites
-- tied to the existing buyer magic-link session (no separate buyer account system).

create type public.event_discovery_category as enum (
  'party', 'concert', 'conference', 'talk', 'seminar', 'networking', 'educational', 'theater'
);

alter table public.events
  add column discovery_category public.event_discovery_category not null default 'party';

create table public.event_favorites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (event_id, session_hash)
);

alter table public.event_favorites enable row level security;
-- No RLS policies: all access goes through the security definer RPCs below, same pattern as
-- buyer_sessions/buyer_access_tokens.

-- Public discovery listing: now also returns the category so /eventos can filter by it.
-- The return shape changed (new trailing column), so the old signature must be dropped first.
drop function if exists public.get_public_events_discovery();

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
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;

-- Toggle a favorite for the caller's buyer session. Requires an active (non-expired, non-revoked)
-- session, i.e. the visitor already completed the Magic Link flow at least once.
create or replace function public.toggle_event_favorite(target_event uuid, target_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_valid boolean;
  already_favorited boolean;
begin
  select exists (
    select 1 from public.buyer_sessions
    where session_hash = target_session_hash and revoked_at is null and expires_at > now()
  ) into session_valid;
  if not session_valid then
    raise exception 'SESSION_REQUIRED' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.event_favorites
    where event_id = target_event and session_hash = target_session_hash
  ) into already_favorited;

  if already_favorited then
    delete from public.event_favorites
    where event_id = target_event and session_hash = target_session_hash;
    return false;
  else
    insert into public.event_favorites (event_id, session_hash) values (target_event, target_session_hash);
    return true;
  end if;
end;
$$;

revoke all on function public.toggle_event_favorite(uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_event_favorite(uuid, text) to anon, authenticated;

-- Enumeration-safe: an invalid/expired session simply has no favorites, no error.
create or replace function public.get_favorited_event_ids(target_session_hash text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(f.event_id), '{}')
  from public.event_favorites f
  where f.session_hash = target_session_hash
    and exists (
      select 1 from public.buyer_sessions s
      where s.session_hash = f.session_hash and s.revoked_at is null and s.expires_at > now()
    );
$$;

revoke all on function public.get_favorited_event_ids(text) from public, anon, authenticated;
grant execute on function public.get_favorited_event_ids(text) to anon, authenticated;
