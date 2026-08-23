begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Keep the suite deterministic after a manual local review has already emitted
-- or delivered the controlled seed Order. The transaction rollback restores it.
delete from public.ticket_deliveries where order_id = '2b000000-0000-4000-8000-000000000002';
delete from public.tickets where order_id = '2b000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.issue_tickets_for_paid_order(
    '2b000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000011', 'unit_index', 1, 'short_code', 'NAAA-A1', 'qr_token_hash', repeat('a', 64), 'qr_token_encrypted', repeat('x', 40)),
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000011', 'unit_index', 2, 'short_code', 'NAAA-A2', 'qr_token_hash', repeat('b', 64), 'qr_token_encrypted', repeat('y', 40)),
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000012', 'unit_index', 1, 'short_code', 'NAAA-A3', 'qr_token_hash', repeat('c', 64), 'qr_token_encrypted', repeat('z', 40))
    )
  )$$,
  'paid order emits tickets'
);

select is(
  (select count(*) from public.tickets where order_id = '2b000000-0000-4000-8000-000000000002'),
  3::bigint,
  'quantity 3 creates exactly 3 individual tickets'
);
select is(
  (select count(*) from public.tickets where order_item_id = '2b000000-0000-4000-8000-000000000011'),
  2::bigint,
  'first ticket type creates two tickets'
);
select is(
  (select count(*) from public.tickets where order_item_id = '2b000000-0000-4000-8000-000000000012'),
  1::bigint,
  'second ticket type creates one ticket'
);
select is(
  (select count(distinct qr_token_hash) from public.tickets where order_id = '2b000000-0000-4000-8000-000000000002'),
  3::bigint,
  'every issued ticket has a unique QR credential'
);

select lives_ok(
  $$select public.issue_tickets_for_paid_order(
    '2b000000-0000-4000-8000-000000000002',
    jsonb_build_array(
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000011', 'unit_index', 1, 'short_code', 'NBBB-B1', 'qr_token_hash', repeat('d', 64), 'qr_token_encrypted', repeat('x', 40)),
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000011', 'unit_index', 2, 'short_code', 'NBBB-B2', 'qr_token_hash', repeat('e', 64), 'qr_token_encrypted', repeat('y', 40)),
      jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000012', 'unit_index', 1, 'short_code', 'NBBB-B3', 'qr_token_hash', repeat('f', 64), 'qr_token_encrypted', repeat('z', 40))
    )
  )$$,
  'retrying issuance succeeds'
);
select is(
  (select count(*) from public.tickets where order_id = '2b000000-0000-4000-8000-000000000002'),
  3::bigint,
  'retry does not duplicate tickets'
);
select throws_ok(
  $$insert into public.tickets (
    organization_id, event_id, order_id, order_item_id, ticket_type_id, customer_id,
    unit_index, holder_first_name, holder_last_name, valid_from, valid_until,
    short_code, qr_token_hash, qr_token_encrypted
  ) select organization_id, event_id, order_id, order_item_id, ticket_type_id, customer_id,
    unit_index, holder_first_name, holder_last_name, valid_from, valid_until,
    'NCCC-C1', repeat('1', 64), repeat('q', 40)
  from public.tickets where order_item_id = '2b000000-0000-4000-8000-000000000011' and unit_index = 1$$,
  '23505',
  'duplicate key value violates unique constraint "tickets_order_item_id_unit_index_key"',
  'database constraint rejects a duplicate OrderItem unit'
);

select * from public.create_guest_checkout(
  '44444444-4444-4444-8444-444444444444', 'Pending', 'Buyer', 'pending-ticket@example.invalid', '', '',
  '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
);
select throws_ok(
  format(
    $$select public.issue_tickets_for_paid_order(%L, '[]'::jsonb)$$,
    (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'pending-ticket@example.invalid')
  ),
  'P0001', 'ORDER_NOT_PAID', 'pending order cannot emit tickets'
);

select throws_ok(
  $$select public.create_buyer_access_token(
    'buyer@nightlife.local', repeat('1', 64),
    encode(extensions.digest(convert_to('buyer@nightlife.local', 'UTF8'), 'sha256'), 'hex'),
    now() - interval '1 minute'
  )$$,
  'P0001', 'INVALID_BUYER_ACCESS_REQUEST', 'expired buyer magic link cannot be created'
);
select ok(
  public.create_buyer_access_token(
    'buyer@nightlife.local', repeat('2', 64),
    encode(extensions.digest(convert_to('buyer@nightlife.local', 'UTF8'), 'sha256'), 'hex'),
    now() + interval '15 minutes'
  ) is not null,
  'valid buyer magic link is created for an email with tickets'
);
select is(
  public.exchange_buyer_access_token(repeat('3', 64), repeat('4', 64), now() + interval '30 days'),
  false,
  'manipulated buyer magic link is rejected'
);
select is(
  public.exchange_buyer_access_token(repeat('2', 64), repeat('4', 64), now() + interval '30 days'),
  true,
  'valid buyer magic link creates a session'
);
select is(
  public.exchange_buyer_access_token(repeat('2', 64), repeat('5', 64), now() + interval '30 days'),
  false,
  'buyer magic link is one-time use'
);
select is(
  (select count(*) from public.get_buyer_session_customers(repeat('4', 64))),
  1::bigint,
  'buyer session maps only its authorized customer'
);

select is(
  (select should_send from public.claim_ticket_delivery('2b000000-0000-4000-8000-000000000002', repeat('8', 64), false)),
  true,
  'first ticket email delivery is claimed'
);
select lives_ok(
  $$select public.complete_ticket_delivery(
    (select id from public.ticket_deliveries where order_id = '2b000000-0000-4000-8000-000000000002'),
    false,
    'smtp_delivery_failed'
  )$$,
  'email failure is recorded without reverting tickets'
);
select is(
  (select should_send from public.claim_ticket_delivery('2b000000-0000-4000-8000-000000000002', repeat('8', 64), false)),
  true,
  'failed ticket delivery can be retried'
);
select lives_ok(
  $$select public.complete_ticket_delivery(
    (select id from public.ticket_deliveries where order_id = '2b000000-0000-4000-8000-000000000002'),
    true,
    null
  )$$,
  'successful retry marks delivery sent'
);
select is(
  (select should_send from public.claim_ticket_delivery('2b000000-0000-4000-8000-000000000002', repeat('8', 64), false)),
  false,
  'sent delivery is not duplicated automatically'
);

insert into public.organizations (id, name, slug)
values ('2b000000-0000-4000-8000-000000000101', 'Other Club', 'other-club');
insert into public.venues (id, organization_id, name, address, city, province, capacity, timezone)
values ('2b000000-0000-4000-8000-000000000102', '2b000000-0000-4000-8000-000000000101', 'Other Venue', 'Other 123', 'Mendoza', 'Mendoza', 10, 'America/Argentina/Mendoza');
insert into public.events (id, organization_id, venue_id, name, slug, starts_at, status, capacity, currency, created_by)
values ('2b000000-0000-4000-8000-000000000103', '2b000000-0000-4000-8000-000000000101', '2b000000-0000-4000-8000-000000000102', 'Other Event', 'other-event', now() + interval '10 days', 'draft', 10, 'ARS', '11111111-1111-4111-8111-111111111111');
insert into public.ticket_types (id, organization_id, event_id, name, price_amount, quantity)
values ('2b000000-0000-4000-8000-000000000104', '2b000000-0000-4000-8000-000000000101', '2b000000-0000-4000-8000-000000000103', 'Other Type', 10000, 10);
insert into public.customers (id, organization_id, first_name, last_name, email)
values ('2b000000-0000-4000-8000-000000000105', '2b000000-0000-4000-8000-000000000101', 'Other', 'Buyer', 'other@example.invalid');
insert into public.orders (id, public_id, organization_id, event_id, customer_id, status, subtotal_amount, service_fee_amount, total_amount, currency, expires_at)
values ('2b000000-0000-4000-8000-000000000106', repeat('6', 32), '2b000000-0000-4000-8000-000000000101', '2b000000-0000-4000-8000-000000000103', '2b000000-0000-4000-8000-000000000105', 'paid', 10000, 0, 10000, 'ARS', now() + interval '10 minutes');
insert into public.order_items (id, organization_id, order_id, ticket_type_id, item_name, quantity, unit_price_amount, line_total_amount, currency)
values ('2b000000-0000-4000-8000-000000000107', '2b000000-0000-4000-8000-000000000101', '2b000000-0000-4000-8000-000000000106', '2b000000-0000-4000-8000-000000000104', 'Other Type', 1, 10000, 10000, 'ARS');
select public.issue_tickets_for_paid_order(
  '2b000000-0000-4000-8000-000000000106',
  jsonb_build_array(jsonb_build_object('order_item_id', '2b000000-0000-4000-8000-000000000107', 'unit_index', 1, 'short_code', 'NDDD-D1', 'qr_token_hash', repeat('7', 64), 'qr_token_encrypted', repeat('w', 40)))
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select count(*) from public.tickets where organization_id = '2b000000-0000-4000-8000-000000000101'),
  0::bigint,
  'organization A cannot read organization B tickets'
);
select is(
  (select count(*) from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222'),
  3::bigint,
  'organization A can read its own tickets'
);
select lives_ok(
  $$select public.cancel_ticket((select id from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222' order by id limit 1))$$,
  'authorized producer can cancel a ticket'
);
select is(
  (select count(*) from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222' and status = 'cancelled'),
  1::bigint,
  'cancelled ticket is no longer valid'
);

reset role;
update public.orders set status = 'refunded' where id = '2b000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.tickets where order_id = '2b000000-0000-4000-8000-000000000002' and status = 'refunded'),
  3::bigint,
  'full refund marks every ticket refunded'
);
select is(
  (select count(*) from public.audit_logs where action = 'ticket.refunded' and after_data->>'order_id' = '2b000000-0000-4000-8000-000000000002'),
  3::bigint,
  'refund transition is auditable per ticket'
);
select ok(
  public.create_buyer_access_token(
    'buyer@nightlife.local', repeat('9', 64),
    encode(extensions.digest(convert_to('buyer@nightlife.local', 'UTF8'), 'sha256'), 'hex'),
    now() + interval '15 minutes'
  ) is not null,
  'buyer can recover the visible status of refunded tickets'
);

select * from finish();
rollback;
