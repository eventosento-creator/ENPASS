begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.ticket_types set price_amount = 0
where id = '55555555-5555-4555-8555-555555555551';

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Free', 'Buyer', 'free-order@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'free checkout creates its order and hold atomically'
);
select is(
  (select total_amount from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  0::bigint,
  'free checkout has a zero server-calculated total'
);
select is(
  (select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  'pending',
  'free order starts pending'
);
select is(
  (select h.status::text from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  'active',
  'free order starts with an active hold'
);
select lives_ok(
  $$select public.complete_free_order(
    (select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid')
  )$$,
  'service completion confirms a valid free order'
);
select is(
  (select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  'paid',
  'free completion marks the order confirmed using the existing paid fulfillment state'
);
select is(
  (select h.status::text from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  'consumed',
  'free completion consumes the hold'
);
select is(
  (select count(*) from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid'),
  0::bigint,
  'free completion creates no payment record'
);
select lives_ok(
  $$select public.complete_free_order(
    (select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'free-order@example.invalid')
  )$$,
  'free completion is idempotent'
);
select ok(
  not has_function_privilege('anon', 'public.complete_free_order(text)', 'execute')
  and has_function_privilege('service_role', 'public.complete_free_order(text)', 'execute'),
  'only the server role can confirm free orders'
);

select * from finish();
rollback;
