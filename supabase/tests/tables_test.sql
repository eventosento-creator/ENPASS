begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Seed projections and idempotent fulfillment.
select is((select availability_status from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000202'), 'available', 'available table is public');
select is((select availability_status from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000203'), 'held', 'active table hold is derived as held');
select is((select availability_status from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000201'), 'sold', 'consumed table hold is derived as sold');
select is((select count(*) from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000204'), 0::bigint, 'disabled table is not public');
select is((select jsonb_array_length(benefits) from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000201'), 2, 'public table exposes buyer-safe benefits');
select is((select service_fee_bps from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000202'), 500, 'table fee falls back to organization table policy');
select is((select count(*) from public.tickets where event_table_id = 'e5000000-0000-4000-8000-000000000201'), 1::bigint, 'sold table has exactly one group credential');
select is((select max_entries from public.tickets where event_table_id = 'e5000000-0000-4000-8000-000000000201'), 8, 'group credential capacity comes from the table');
select is((select count(*) from public.entitlements where order_id = 'e5000000-0000-4000-8000-000000000501'), 3::bigint, 'paid table issues access and benefit entitlements');
select is((select quantity from public.entitlements where order_id = 'e5000000-0000-4000-8000-000000000501' and entitlement_type = 'access'), 8, 'access entitlement mirrors table capacity');
select is((select commission_amount from public.promoter_commissions where order_item_id = 'e5000000-0000-4000-8000-000000000601'), 1200000::bigint, 'five percent table commission is calculated correctly');
select is((select base_amount from public.promoter_commissions where order_item_id = 'e5000000-0000-4000-8000-000000000601'), 24000000::bigint, 'table commission excludes buyer service fee');
select is((select subject_type::text from public.promoter_commissions where order_item_id = 'e5000000-0000-4000-8000-000000000601'), 'table', 'commission snapshot records its table subject');
select is(public.calculate_promoter_commissions_for_order('e5000000-0000-4000-8000-000000000501'), 0, 'table commission retry creates nothing');
select is((select count(*) from public.promoter_commissions where order_item_id = 'e5000000-0000-4000-8000-000000000601'), 1::bigint, 'table commission is unique per order item');

-- Exclusive hold, expiration and server-calculated money.
select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Table', 'First', 'table-first@example.invalid', '', '',
    '[{"item_type":"table","item_id":"e5000000-0000-4000-8000-000000000202","quantity":1}]'::jsonb
  )$$,
  'first buyer can hold an available table'
);
select is((select item_type::text from public.order_items i join public.orders o on o.id = i.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-first@example.invalid'), 'table', 'checkout creates a typed table order item');
select is((select ticket_type_id from public.order_items i join public.orders o on o.id = i.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-first@example.invalid'), null::uuid, 'table order item never carries a ticket type');
select is((select h.status::text from public.table_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-first@example.invalid'), 'active', 'checkout creates an active table hold');
select is((select total_amount from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-first@example.invalid'), 25200000::bigint, 'checkout calculates base plus configurable table fee');
select throws_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Table', 'Collision', 'table-collision@example.invalid', '', '',
    '[{"item_type":"table","item_id":"e5000000-0000-4000-8000-000000000202","quantity":1}]'::jsonb
  )$$,
  'P0001', 'TABLE_UNAVAILABLE', 'second buyer cannot hold the same physical table'
);
update public.table_holds h set expires_at = now() - interval '1 second'
from public.orders o join public.customers c on c.id = o.customer_id
where h.order_id = o.id and c.email = 'table-first@example.invalid';
select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Table', 'Second', 'table-second@example.invalid', '', '',
    '[{"item_type":"table","item_id":"e5000000-0000-4000-8000-000000000202","quantity":1}]'::jsonb
  )$$,
  'expired hold releases the table for another buyer'
);
select is((select h.status::text from public.table_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-first@example.invalid'), 'expired', 'server expires the abandoned hold');
select is((select h.status::text from public.table_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 'active', 'replacement buyer owns the only active hold');
select is((select availability_status from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000202'), 'held', 'public availability reflects replacement hold');

-- Payment transition and retry-safe fulfillment.
insert into public.payment_accounts (
  id, organization_id, provider, provider_account_id, access_token_encrypted,
  refresh_token_encrypted, live_mode, status, connected_at
) values (
  'e5f00000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
  'mercado_pago', 'table-test-seller', 'encrypted-table-token', 'encrypted-table-refresh', false, 'connected', now()
);
select lives_ok(
  $$select * from public.prepare_payment_attempt((select o.public_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'))$$,
  'table order prepares through the existing payment system'
);
select is(
  public.process_payment_update(
    (select p.public_id from public.payments p join public.orders o on o.id = p.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'),
    'mp-table-approved', 'approved'::public.payment_status, 'approved', 'accredited', 25200000, 'ARS'::char(3), 0, 25200000, now()
  ),
  'approved', 'approved payment sells the held table'
);
select is((select o.status::text from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 'paid', 'table order becomes paid');
select is((select h.status::text from public.table_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 'consumed', 'payment consumes table hold');
select lives_ok(
  $$select public.issue_tickets_for_paid_order(
    (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'),
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select i.id from public.order_items i join public.orders o on o.id = i.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'),
      'unit_index', 1, 'short_code', 'NTBL-T1', 'qr_token_hash', repeat('a', 64), 'qr_token_encrypted', repeat('b', 40)
    ))
  )$$,
  'paid table fulfills through the existing ticket issuer'
);
select is((select max_entries from public.tickets t join public.orders o on o.id = t.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 8, 'issued table credential has eight entries');
select is((select count(*) from public.entitlements e join public.orders o on o.id = e.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 2::bigint, 'issuer creates access plus configured benefit');
select is(
  (public.issue_tickets_for_paid_order(
    (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'),
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select i.id from public.order_items i join public.orders o on o.id = i.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'),
      'unit_index', 1, 'short_code', 'NTBL-T1', 'qr_token_hash', repeat('a', 64), 'qr_token_encrypted', repeat('b', 40)
    ))
  )->>'inserted_count')::integer,
  0, 'fulfillment retry inserts no credential'
);
select is((select count(*) from public.entitlements e join public.orders o on o.id = e.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 2::bigint, 'fulfillment retry inserts no entitlement');

-- Shared scanner: group entries 1 through 8 valid, ninth rejected.
insert into public.scanner_device_authorizations (
  id, organization_id, event_id, access_gate_id, label, permission, pin_hash,
  code_expires_at, session_expires_at, activation_count, activated_at, created_by
) values (
  'e5f00000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000002',
  'Table scanner', 'scanner', null, now() + interval '1 hour', now() + interval '1 hour', 1, now(),
  '11111111-1111-4111-8111-111111111111'
);
insert into public.scanner_sessions (
  id, authorization_id, organization_id, event_id, access_gate_id,
  permission, session_token_hash, expires_at
) values (
  'e5f00000-0000-4000-8000-000000000012', 'e5f00000-0000-4000-8000-000000000011',
  '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'a3000000-0000-4000-8000-000000000002', 'scanner', repeat('e', 64), now() + interval '1 hour'
);
update public.tickets set valid_from = now() - interval '1 hour', valid_until = now() + interval '1 hour'
where order_id = (select o.id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid');
select is((select ticket_type_name from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000101')), 'Mesa VIP 09', 'scanner presents table identity');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000102')), 'valid', 'table scan 2 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000103')), 'valid', 'table scan 3 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000104')), 'valid', 'table scan 4 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000105')), 'valid', 'table scan 5 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000106')), 'valid', 'table scan 6 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000107')), 'valid', 'table scan 7 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000108')), 'valid', 'table scan 8 is valid');
select is((select result::text from public.check_in_ticket(repeat('e', 64), repeat('a', 64), 'e5f00000-0000-4000-8000-000000000109')), 'already_used', 'table scan 9 is rejected at capacity');

-- Refund policy: unused releases; used remains occupied for manual review.
select lives_ok($$update public.orders set status = 'refunded' where id = 'e5000000-0000-4000-8000-000000000501'$$, 'unused table refund is processed');
select is((select status::text from public.table_holds where order_id = 'e5000000-0000-4000-8000-000000000501'), 'cancelled', 'unused refunded table is released');
select is((select status::text from public.tickets where order_id = 'e5000000-0000-4000-8000-000000000501'), 'refunded', 'unused table credential is revoked');
select is((select count(*) from public.entitlements where order_id = 'e5000000-0000-4000-8000-000000000501' and status = 'revoked'), 3::bigint, 'unused table entitlements are revoked');
select is((select status::text from public.promoter_commissions where order_id = 'e5000000-0000-4000-8000-000000000501'), 'refunded', 'table commission follows the refund');
update public.orders o set status = 'refunded' from public.customers c where c.id = o.customer_id and c.email = 'table-second@example.invalid';
select is((select h.status::text from public.table_holds h join public.orders o on o.id = h.order_id join public.customers c on c.id = o.customer_id where c.email = 'table-second@example.invalid'), 'refund_review', 'used refunded table enters manual review');
select is((select availability_status from public.get_public_event_tables('44444444-4444-4444-8444-444444444444') where id = 'e5000000-0000-4000-8000-000000000202'), 'sold', 'used refunded table is never automatically resold');

-- Duplication copies configuration only.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.duplicate_event_with_options(
    '44444444-4444-4444-8444-444444444444', 'Noche con mesas copia', 'noche-con-mesas-copia-test',
    now() + interval '45 days', true, true
  )$$,
  'duplication can preserve table configuration'
);
reset role;
select is((select count(*) from public.table_zones z join public.events e on e.id = z.event_id where e.slug = 'noche-con-mesas-copia-test'), 2::bigint, 'duplication copies zones');
select is((select count(*) from public.event_tables t join public.events e on e.id = t.event_id where e.slug = 'noche-con-mesas-copia-test'), 4::bigint, 'duplication copies tables');
select is((select count(*) from public.table_entitlement_templates b join public.events e on e.id = b.event_id where e.slug = 'noche-con-mesas-copia-test'), 4::bigint, 'duplication copies benefit templates');
select is((select count(*) from public.table_holds h join public.events e on e.id = h.event_id where e.slug = 'noche-con-mesas-copia-test'), 0::bigint, 'duplication copies no holds');
select is((select count(*) from public.orders o join public.events e on e.id = o.event_id where e.slug = 'noche-con-mesas-copia-test'), 0::bigint, 'duplication copies no table sales');

-- RLS and tenant isolation.
insert into public.organizations (id, name, slug) values ('e5f00000-0000-4000-8000-000000000201', 'Other Tables Org', 'other-tables-org');
insert into public.venues (id, organization_id, name, address, city, province, capacity, timezone)
values ('e5f00000-0000-4000-8000-000000000202', 'e5f00000-0000-4000-8000-000000000201', 'Other Venue', 'Other 1', 'Mendoza', 'Mendoza', 100, 'America/Argentina/Mendoza');
insert into public.events (id, organization_id, venue_id, name, slug, starts_at, status, capacity, created_by)
values ('e5f00000-0000-4000-8000-000000000203', 'e5f00000-0000-4000-8000-000000000201', 'e5f00000-0000-4000-8000-000000000202', 'Other Tables Event', 'other-tables-event', now() + interval '10 days', 'draft', 100, '11111111-1111-4111-8111-111111111111');
insert into public.table_zones (id, organization_id, event_id, name)
values ('e5f00000-0000-4000-8000-000000000204', 'e5f00000-0000-4000-8000-000000000201', 'e5f00000-0000-4000-8000-000000000203', 'Hidden Zone');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*) from public.table_zones where organization_id = 'e5f00000-0000-4000-8000-000000000201'), 0::bigint, 'producer RLS hides another tenant table zones');
set local role anon;
select throws_ok($$select count(*) from public.table_holds$$, '42501', 'permission denied for table table_holds', 'anonymous buyer cannot enumerate private holds');

select * from finish();
rollback;
