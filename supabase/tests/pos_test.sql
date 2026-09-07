begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('public', 'products', 'products table exists');
select has_table('public', 'event_products', 'event products table exists');
select has_table('public', 'sales_locations', 'sales locations table exists');
select has_table('public', 'pos_sessions', 'cash sessions table exists');
select has_table('public', 'pos_cash_movements', 'cash ledger table exists');
select is((select count(*) from public.products where organization_id = '22222222-2222-4222-8222-222222222222'), 5::bigint, 'demo catalog is seeded');
select is((select count(*) from public.event_products where event_id = '44444444-4444-4444-8444-444444444444'), 5::bigint, 'demo event prices are seeded');
select is((select count(*) from public.sales_locations where event_id = '44444444-4444-4444-8444-444444444444'), 2::bigint, 'demo locations are seeded');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select is((select count(*) from public.products), 0::bigint, 'another tenant cannot read the catalog');
select is((select count(*) from public.sales_locations), 0::bigint, 'another tenant cannot read sales locations');

set local role service_role;
select is((select activation_status from public.activate_pos_device('000000', repeat('f', 64), repeat('0', 64))), 'invalid', 'an invalid PIN is rejected');
select is((select activation_status from public.activate_pos_device('481920', repeat('a', 64), repeat('b', 64))), 'ok', 'a valid PIN activates the device');
select is((select activation_count from public.pos_device_authorizations where id = 'f6000000-0000-4000-8000-000000000501'), 1, 'activation is single use');
select is((select activation_status from public.activate_pos_device('481920', repeat('c', 64), repeat('d', 64))), 'invalid', 'an activated PIN cannot be reused');
select lives_ok($$select public.open_pos_session(repeat('a', 64), 500000, 'Operador QA')$$, 'device opens a cash session');
select is((select count(*) from public.get_pos_catalog(repeat('a', 64))), 4::bigint, 'device only receives products assigned to its location');
select lives_ok(
  $$select * from public.finalize_pos_sale(
    repeat('a', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    jsonb_build_array(jsonb_build_object('event_product_id', 'f6000000-0000-4000-8000-000000000301', 'quantity', 2)),
    'cash', 3000000, null
  )$$,
  'cash sale completes transactionally'
);
select is((select total_amount from public.orders where pos_idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2000000::bigint, 'server resolves the authoritative price');
select ok((select channel = 'pos' and status = 'paid' and customer_id is null and expires_at is null from public.orders where pos_idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'POS order reuses Order without a buyer or hold');
select ok((select item_type = 'product' and item_name = 'Fernet' and unit_price_amount = 1000000 from public.order_items where order_id = (select id from public.orders where pos_idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'order item stores immutable product and price snapshots');
select ok((select provider = 'manual' and method = 'cash' and status = 'approved' from public.payments where order_id = (select id from public.orders where pos_idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'sale records an approved manual payment');
select is((select count(*) from public.pos_cash_movements where type = 'sale'), 1::bigint, 'cash sale creates one ledger movement');
select ok((select reused from public.finalize_pos_sale(repeat('a', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', jsonb_build_array(jsonb_build_object('event_product_id', 'f6000000-0000-4000-8000-000000000301', 'quantity', 2)), 'cash', 3000000, null)), 'idempotent retry returns the original sale');
select is((select count(*) from public.orders where pos_idempotency_key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::bigint, 'idempotency prevents duplicate orders');
select lives_ok($$select public.add_pos_cash_movement(repeat('a', 64), 'cash_in', 100000, 'Cambio adicional')$$, 'cash input is recorded');
select lives_ok($$select public.add_pos_cash_movement(repeat('a', 64), 'cash_out', 50000, 'Compra de hielo')$$, 'cash output is recorded');
select is((select expected_cash_amount from public.get_pos_cash_summary(repeat('a', 64))), 2550000::bigint, 'expected cash follows the immutable ledger');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$select public.update_event_configuration('44444444-4444-4444-8444-444444444444', 'nightlife', true, true, true, true, false, false)$$,
  'P0001', 'OPEN_POS_SESSIONS', 'POS cannot be disabled while a cash session is open'
);

reset role;
set local role service_role;
select lives_ok($$select * from public.close_pos_session(repeat('a', 64), 2500000)$$, 'cash session closes with a counted amount');
select is((select closing_difference_amount from public.pos_sessions order by opened_at desc limit 1), (-50000)::bigint, 'close stores the cash difference');
select throws_ok(
  $$select * from public.finalize_pos_sale(repeat('a', 64), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', jsonb_build_array(jsonb_build_object('event_product_id', 'f6000000-0000-4000-8000-000000000301', 'quantity', 1)), 'cash', 1000000, null)$$,
  'P0001', 'CASH_SESSION_REQUIRED', 'closed sessions cannot accept another sale'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.duplicate_event_with_options('44444444-4444-4444-8444-444444444444', 'Noche POS copia', 'noche-pos-copy-test', now() + interval '90 days', true, true, true, true, true)$$,
  'owner can duplicate POS configuration'
);
select is((select count(*) from public.event_products ep join public.events e on e.id = ep.event_id where e.slug = 'noche-pos-copy-test'), 5::bigint, 'duplicate copies event products and prices');
select is((select count(*) from public.sales_locations sl join public.events e on e.id = sl.event_id where e.slug = 'noche-pos-copy-test'), 2::bigint, 'duplicate copies sales locations');
select is((select count(*) from public.pos_device_authorizations d join public.events e on e.id = d.event_id where e.slug = 'noche-pos-copy-test'), 0::bigint, 'duplicate does not copy devices');
select is((select count(*) from public.orders o join public.events e on e.id = o.event_id where e.slug = 'noche-pos-copy-test'), 0::bigint, 'duplicate does not copy sales');

select * from finish();
rollback;
