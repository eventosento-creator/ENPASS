begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.events (id, organization_id, venue_id, name, slug, description, starts_at, status, capacity, currency, published_at, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Cancelado', 'discovery-cancelado', '', now() + interval '2 days', 'cancelled', 100, 'ARS', null, '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Pasado', 'discovery-pasado', '', now() - interval '2 days', 'published', 100, 'ARS', now() - interval '3 days', '11111111-1111-4111-8111-111111111111');

select is((select count(*) from public.get_public_events_discovery() where slug = 'fecha-en-preparacion'), 0::bigint, 'draft events are not exposed');
select is((select count(*) from public.get_public_events_discovery() where slug = 'discovery-cancelado'), 0::bigint, 'cancelled events are not exposed');
select is((select count(*) from public.get_public_events_discovery() where slug = 'discovery-pasado'), 0::bigint, 'past events are not exposed');
select ok(not exists (
  select 1 from (
    select starts_at, lag(starts_at) over (order by starts_at) as previous_start
    from public.get_public_events_discovery()
  ) ordered where previous_start > starts_at
), 'public events are ordered chronologically');

insert into public.ticket_types (id, organization_id, event_id, sale_phase_id, name, price_amount, quantity, max_per_order, sort_order, publicly_available)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666661', 'Invitación interna', 100, 20, 6, -1, false);

select is((select count(*) from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'), 0::bigint, 'internal ticket types are not exposed publicly');
select is((select from_price_amount from public.get_public_events_discovery() where slug = 'noche-2000'), 1000000::bigint, 'starting price uses the current available phase');

select throws_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Internal', 'Buyer', 'private-ticket@example.invalid', '', '',
    '[{"ticket_type_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6","quantity":1}]'::jsonb
  )$$,
  'P0001', 'INVALID_SELECTION', 'guest checkout rejects internal ticket types'
);

insert into public.customers (id, organization_id, first_name, last_name, email)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '22222222-2222-4222-8222-222222222222', 'Test', 'Discovery', 'discovery-sold-out@example.invalid');
insert into public.orders (id, public_id, organization_id, event_id, customer_id, subtotal_amount, service_fee_amount, total_amount, currency, expires_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 'discovery-sold-out-order', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 100000000, 8000000, 108000000, 'ARS', now() + interval '10 minutes');
insert into public.ticket_holds (id, organization_id, event_id, ticket_type_id, order_id, quantity, expires_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555551', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', 100, now() + interval '10 minutes');

select is((select from_price_amount from public.get_public_events_discovery() where slug = 'noche-2000'), 1300000::bigint, 'a sold-out first phase exposes the next available public price');

set local role anon;
select lives_ok($$select * from public.get_public_events_discovery()$$, 'anon can read the safe discovery projection');

select * from finish();
rollback;
