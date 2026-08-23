begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.organizations set platform_fee_bps = 300 where id = '22222222-2222-4222-8222-222222222222';

insert into public.payment_accounts (
  id, organization_id, provider, provider_account_id, access_token_encrypted,
  refresh_token_encrypted, live_mode, status, connected_at
) values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'mercado_pago', 'test-seller', 'encrypted-test-token',
  'encrypted-test-refresh', false, 'connected', now()
);

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Approved', 'Buyer', 'approved-payment@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'creates a checkout for an approved payment'
);

select lives_ok(
  $$select * from public.prepare_payment_attempt((select public_id from public.orders where customer_id = (select id from public.customers where email = 'approved-payment@example.invalid')))$$,
  'prepares one open payment attempt'
);
select is(
  (select p.platform_fee_amount from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'approved-payment@example.invalid'),
  30000::bigint,
  'platform fee is configured in basis points and calculated from the server-side subtotal'
);

select is(
  public.process_payment_update(
    (select p.public_id from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'approved-payment@example.invalid'),
    'mp-approved-1', 'approved'::public.payment_status, 'approved', 'accredited',
    (select p.gross_amount from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'approved-payment@example.invalid'),
    'ARS'::char(3), 50000, 1000000, now()
  ),
  'approved',
  'an approved provider payment is processed'
);

select is((select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'approved-payment@example.invalid'), 'paid', 'approval marks the order paid');
select is((select h.status::text from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'approved-payment@example.invalid'), 'consumed', 'approval consumes the hold');
select results_eq(
  $$select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '55555555-5555-4555-8555-555555555551'$$,
  $$values (99::bigint)$$,
  'consumed inventory stays unavailable'
);

select is(
  public.process_payment_update(
    (select p.public_id from public.payments p where p.provider_payment_id = 'mp-approved-1'),
    'mp-approved-1', 'approved'::public.payment_status, 'approved', 'accredited',
    (select gross_amount from public.payments where provider_payment_id = 'mp-approved-1'),
    'ARS'::char(3), 50000, 1000000, now()
  ),
  'already_approved',
  'a duplicate approved webhook is idempotent'
);
select is((select count(*) from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where h.status = 'consumed' and c.email = 'approved-payment@example.invalid'), 1::bigint, 'duplicate processing has no inventory side effect');

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Rejected', 'Buyer', 'rejected-payment@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'creates a checkout for a rejected payment'
);
select lives_ok(
  $$select * from public.prepare_payment_attempt((select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'))$$,
  'prepares the rejected attempt'
);
select is(
  public.process_payment_update(
    (select p.public_id from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'),
    'mp-rejected-1', 'rejected'::public.payment_status, 'rejected', 'cc_rejected_other_reason',
    (select p.gross_amount from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'),
    'ARS'::char(3), 0, null, null
  ),
  'rejected',
  'a rejected provider payment is recorded'
);
select is((select h.status::text from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'), 'active', 'rejection preserves the active hold for retry');
select is((select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'), 'pending', 'rejection keeps the order pending');
select lives_ok(
  $$select * from public.prepare_payment_attempt((select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'))$$,
  'a rejected payment can create a new attempt while the hold remains active'
);
select is((select count(*) from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'rejected-payment@example.invalid'), 2::bigint, 'retry preserves the rejected attempt history');

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Late', 'Buyer', 'late-payment@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'creates a checkout for a late approval'
);
select lives_ok(
  $$select * from public.prepare_payment_attempt((select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'late-payment@example.invalid'))$$,
  'prepares the late approval attempt'
);
update public.ticket_holds h set expires_at = now() - interval '1 second'
from public.orders o join public.customers c on c.id = o.customer_id
where h.order_id = o.id and c.email = 'late-payment@example.invalid';
select is(
  public.process_payment_update(
    (select p.public_id from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'late-payment@example.invalid'),
    'mp-late-1', 'approved'::public.payment_status, 'approved', 'accredited',
    (select p.gross_amount from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'late-payment@example.invalid'),
    'ARS'::char(3), 50000, 1000000, now()
  ),
  'approved',
  'late approval recovers inventory when capacity is still available'
);
select is((select h.status::text from public.ticket_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'late-payment@example.invalid'), 'consumed', 'recovered late approval consumes its expired hold');

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Conflict', 'Buyer', 'conflict-payment@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'creates a checkout before simulating a late inventory conflict'
);
select lives_ok(
  $$select * from public.prepare_payment_attempt((select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'conflict-payment@example.invalid'))$$,
  'prepares the conflicting attempt'
);
update public.ticket_holds h set expires_at = now() - interval '1 second'
from public.orders o join public.customers c on c.id = o.customer_id
where h.order_id = o.id and c.email = 'conflict-payment@example.invalid';
update public.ticket_types set quantity = 3 where id = '55555555-5555-4555-8555-555555555551';
select is(
  public.process_payment_update(
    (select p.public_id from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'conflict-payment@example.invalid'),
    'mp-conflict-1', 'approved'::public.payment_status, 'approved', 'accredited',
    (select p.gross_amount from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'conflict-payment@example.invalid'),
    'ARS'::char(3), 50000, 1000000, now()
  ),
  'approved_inventory_conflict',
  'late approval becomes an auditable exception when inventory is gone'
);
select is((select p.status::text from public.payments p where p.provider_payment_id = 'mp-conflict-1'), 'approved_inventory_conflict', 'payment exposes the inventory conflict state');
select is((select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'conflict-payment@example.invalid'), 'expired', 'conflicting order is never marked paid');

set local role anon;
select throws_ok($$select count(*) from public.payment_accounts$$, '42501', 'permission denied for table payment_accounts', 'anon cannot read encrypted payment accounts');
select throws_ok($$select count(*) from public.payments$$, '42501', 'permission denied for table payments', 'anon cannot enumerate payments');
select throws_ok($$select count(*) from public.webhook_events$$, '42501', 'permission denied for table webhook_events', 'anon cannot read webhook payloads');

select * from finish();
rollback;
