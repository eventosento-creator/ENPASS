-- Phase 7: numbered seat maps (cinema/airplane-style seat picking), separate from the tables system.
-- Split into two files because a new enum value cannot be used in the same transaction it is added in.

alter type public.order_item_type add value 'seat';
create type public.seat_hold_status as enum ('active', 'consumed', 'expired', 'cancelled', 'refund_review');

create table public.seat_map_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  rows integer not null check (rows between 1 and 26),
  seats_per_row integer not null check (seats_per_row between 1 and 60),
  base_price_amount bigint not null check (base_price_amount >= 0),
  currency char(3) not null default 'ARS',
  service_fee_bps integer check (service_fee_bps is null or service_fee_bps between 0 and 10000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index seat_map_sections_event_name_unique
  on public.seat_map_sections (event_id, lower(name));
create index seat_map_sections_organization_event_idx
  on public.seat_map_sections (organization_id, event_id, sort_order);

create table public.event_seats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  section_id uuid not null references public.seat_map_sections(id) on delete restrict,
  row_label text not null check (row_label ~ '^[A-Z]$'),
  seat_number integer not null check (seat_number between 1 and 60),
  label text generated always as (row_label || seat_number::text) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index event_seats_section_position_unique
  on public.event_seats (section_id, row_label, seat_number);
create index event_seats_organization_event_idx
  on public.event_seats (organization_id, event_id, section_id);

create table public.seat_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  event_seat_id uuid not null references public.event_seats(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.seat_hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index seat_holds_occupying_seat_unique
  on public.seat_holds (event_seat_id)
  where status in ('active', 'consumed', 'refund_review');
create index seat_holds_event_active_idx
  on public.seat_holds (event_id, expires_at)
  where status = 'active';
create index seat_holds_order_idx on public.seat_holds (order_id);

alter table public.events
  add column seatmap_enabled boolean not null default true;

create trigger seat_map_sections_touch before update on public.seat_map_sections
for each row execute function public.touch_updated_at();
create trigger event_seats_touch before update on public.event_seats
for each row execute function public.touch_updated_at();
create trigger seat_holds_touch before update on public.seat_holds
for each row execute function public.touch_updated_at();

alter table public.seat_map_sections enable row level security;
alter table public.event_seats enable row level security;
alter table public.seat_holds enable row level security;

create policy seat_map_sections_manager_select on public.seat_map_sections
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy event_seats_manager_select on public.event_seats
for select to authenticated using ((select public.can_manage_org(organization_id)));
create policy seat_holds_manager_select on public.seat_holds
for select to authenticated using ((select public.can_manage_org(organization_id)));

grant select on public.seat_map_sections, public.event_seats, public.seat_holds to authenticated;
grant all on public.seat_map_sections, public.event_seats, public.seat_holds to service_role;

create trigger seat_map_sections_require_seatmap before insert on public.seat_map_sections
for each row execute function public.reject_disabled_event_module_insert('seatmap_enabled');
create trigger event_seats_require_seatmap before insert on public.event_seats
for each row execute function public.reject_disabled_event_module_insert('seatmap_enabled');
create trigger seat_holds_require_seatmap before insert on public.seat_holds
for each row execute function public.reject_disabled_event_module_insert('seatmap_enabled');
