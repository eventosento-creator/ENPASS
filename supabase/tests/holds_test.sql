begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Isolate the test from any manual checkout left active in the local review environment.
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';

select results_eq(
  $$select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '55555555-5555-4555-8555-555555555551'$$,
  $$values (100::bigint)$$,
  'seed starts with 100 available tickets'
);

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Test', 'Buyer', 'hold-test@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":2}]'::jsonb
  )$$,
  'checkout creates order and holds atomically'
);

select results_eq(
  $$select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '55555555-5555-4555-8555-555555555551'$$,
  $$values (98::bigint)$$,
  'active holds reduce availability'
);

select is((select status::text from public.orders where customer_id = (select id from public.customers where email = 'hold-test@example.invalid')), 'pending', 'new order is pending');
select is((select service_fee_amount from public.orders where customer_id = (select id from public.customers where email = 'hold-test@example.invalid')), 160000::bigint, 'buyer-paid fee uses configurable basis points');

update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
select results_eq(
  $$select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '55555555-5555-4555-8555-555555555551'$$,
  $$values (100::bigint)$$,
  'expired holds release availability without a frontend timer'
);

update public.ticket_types set quantity = 1 where id = '55555555-5555-4555-8555-555555555551';
select * from public.create_guest_checkout(
  '44444444-4444-4444-8444-444444444444', 'First', 'Buyer', 'last-ticket@example.invalid', '', '',
  '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
);
select throws_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Second', 'Buyer', 'oversell@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'P0001', 'TICKET_TYPE_SOLD_OUT', 'a second checkout cannot oversell the ticket type'
);

select * from finish();
rollback;
