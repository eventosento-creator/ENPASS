begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';

select lives_ok(
  $$select * from public.create_guest_checkout(
    '44444444-4444-4444-8444-444444444444', 'Direct', 'Buyer', 'promoter-direct@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb
  )$$,
  'direct checkout still works without promoter context'
);
select is(
  (select o.promoter_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'promoter-direct@example.invalid'),
  null::uuid,
  'direct checkout freezes null attribution'
);

select is(
  (select count(*) from public.record_promoter_link_visit(
    'noche-2000', 'lucas', repeat('a', 64), 'f4111111-1111-4111-8111-111111111111'
  )),
  1::bigint,
  'active Lucas link resolves to a public projection'
);
select lives_ok(
  $$select * from public.create_guest_checkout_attributed(
    '44444444-4444-4444-8444-444444444444', 'Lucas', 'Buyer', 'promoter-lucas@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb,
    repeat('a', 64)
  )$$,
  'checkout accepts server-side attribution session'
);
select is(
  (select o.promoter_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'promoter-lucas@example.invalid'),
  'f4000000-0000-4000-8000-000000000001'::uuid,
  'Lucas link attributes the Order to Lucas'
);

select is(
  (select promoter_display_name from public.record_promoter_link_visit(
    'noche-2000', 'martina', repeat('a', 64), 'f4111111-1111-4111-8111-111111111111'
  )),
  'Martina Ruiz'::text,
  'last valid touch replaces Lucas with Martina for the same Event'
);
select lives_ok(
  $$select * from public.create_guest_checkout_attributed(
    '44444444-4444-4444-8444-444444444444', 'Martina', 'Buyer', 'promoter-martina@example.invalid', '', '',
    '[{"ticket_type_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb,
    repeat('a', 64)
  )$$,
  'checkout after a second touch succeeds'
);
select is(
  (select o.promoter_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'promoter-martina@example.invalid'),
  'f4000000-0000-4000-8000-000000000002'::uuid,
  'last-touch Order is attributed to Martina'
);
select is(
  (select o.promoter_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'promoter-lucas@example.invalid'),
  'f4000000-0000-4000-8000-000000000001'::uuid,
  'a later touch never rewrites frozen Order attribution'
);

select lives_ok(
  $$select * from public.create_guest_checkout_attributed(
    '77777777-7777-4777-8777-777777777771', 'Other', 'Event', 'promoter-wrong-event@example.invalid', '', '',
    '[{"ticket_type_id":"99999999-9999-4999-8999-999999999911","quantity":1}]'::jsonb,
    repeat('a', 64)
  )$$,
  'checkout for another Event succeeds with the same browser session'
);
select is(
  (select o.promoter_id from public.orders o join public.customers c on c.id = o.customer_id where c.email = 'promoter-wrong-event@example.invalid'),
  null::uuid,
  'attribution for Event A never leaks into Event B'
);

update public.event_promoters set status = 'inactive'
where id = 'f4000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.record_promoter_link_visit(
    'noche-2000', 'lucas', repeat('d', 64), 'f4222222-2222-4222-8222-222222222222'
  )),
  0::bigint,
  'inactive EventPromoter link does not create attribution'
);
update public.event_promoters set status = 'active'
where id = 'f4000000-0000-4000-8000-000000000101';

select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000601'),
  300000::bigint,
  'fixed commission multiplies the per-ticket value by quantity'
);
select is(
  (select quantity from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000601'),
  3,
  'fixed commission snapshot preserves ticket quantity'
);
select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000602'),
  130000::bigint,
  'percentage commission uses basis points against ticket base price'
);
select is(
  (select base_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000602'),
  2600000::bigint,
  'percentage base explicitly excludes the buyer service fee'
);
select is(
  (select count(*) from public.promoter_commissions where order_id = 'f4000000-0000-4000-8000-000000000503'),
  2::bigint,
  'multiple TicketTypes preserve one commission breakdown per OrderItem'
);
select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000603'),
  80000::bigint,
  'general percentage applies when no TicketType override exists'
);
select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000604'),
  104000::bigint,
  'TicketType-specific percentage overrides the general rule'
);
select is(
  public.calculate_promoter_commissions_for_order('f4000000-0000-4000-8000-000000000501'),
  0,
  'reprocessing a paid Order creates no duplicate commissions'
);
select is(
  (select count(*) from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000601'),
  1::bigint,
  'commission idempotency is enforced by the database'
);

update public.promoter_commission_rules set commission_value = 150000
where id = 'f4000000-0000-4000-8000-000000000201';
select is(
  (select commission_value from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000601'),
  100000::bigint,
  'changing a rule never rewrites the existing snapshot'
);

insert into public.customers (id, organization_id, first_name, last_name, email)
values ('f4333333-3333-4333-8333-333333333331', '22222222-2222-4222-8222-222222222222', 'Snapshot', 'Buyer', 'snapshot@example.invalid');
insert into public.orders (
  id, public_id, organization_id, event_id, customer_id, status,
  subtotal_amount, service_fee_amount, total_amount, currency, expires_at,
  promoter_id, event_promoter_id
) values (
  'f4333333-3333-4333-8333-333333333332', 'f4333333333333333333333333333332',
  '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'f4333333-3333-4333-8333-333333333331', 'paid', 1600000, 128000, 1728000, 'ARS', now() + interval '10 minutes',
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000101'
);
insert into public.order_items (
  id, organization_id, order_id, ticket_type_id, item_name, quantity,
  unit_price_amount, line_total_amount, currency
) values (
  'f4333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
  'f4333333-3333-4333-8333-333333333332', '55555555-5555-4555-8555-555555555553',
  'General', 1, 1600000, 1600000, 'ARS'
);
select is(
  public.calculate_promoter_commissions_for_order('f4333333-3333-4333-8333-333333333332'),
  1,
  'a later paid Order creates one new commission snapshot'
);
select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4333333-3333-4333-8333-333333333333'),
  150000::bigint,
  'the later Order uses the updated fixed amount'
);
select is(
  (select commission_amount from public.promoter_commissions where order_item_id = 'f4000000-0000-4000-8000-000000000601'),
  300000::bigint,
  'the original three-ticket sale keeps its old total'
);
select is(public.calculate_promoter_percentage(110, 500), 6::bigint, 'percentage rounding is half up');

update public.orders set status = 'refunded'
where id = 'f4333333-3333-4333-8333-333333333332';
select is(
  (select status::text from public.promoter_commissions where order_item_id = 'f4333333-3333-4333-8333-333333333333'),
  'refunded',
  'full refund marks the commission refunded'
);
select is(
  (select count(*) from public.promoter_commissions where order_id = 'f4333333-3333-4333-8333-333333333332' and status = 'confirmed'),
  0::bigint,
  'refunded commission no longer counts as outstanding confirmed debt'
);
select is(
  (select count(*) from public.audit_logs where action = 'commission.refunded' and entity_id = (
    select id from public.promoter_commissions where order_item_id = 'f4333333-3333-4333-8333-333333333333'
  )),
  1::bigint,
  'refund transition is audited exactly once'
);

insert into public.promoter_access_tokens (
  id, organization_id, promoter_id, event_promoter_id, token_hash, expires_at
) values (
  'f4444444-4444-4444-8444-444444444441',
  '22222222-2222-4222-8222-222222222222',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000101', repeat('b', 64), now() + interval '15 minutes'
);
select is(
  public.exchange_promoter_access_token(repeat('b', 64), repeat('c', 64), now() + interval '30 days'),
  true,
  'valid opaque invite creates a promoter session'
);
select is(
  public.exchange_promoter_access_token(repeat('b', 64), repeat('e', 64), now() + interval '30 days'),
  false,
  'promoter invite is single-use'
);
select is(
  (select count(*) from public.get_promoter_dashboard(repeat('c', 64))),
  2::bigint,
  'one Promoter session sees only its own two Event relations'
);

insert into public.organizations (id, name, slug)
values ('f4555555-5555-4555-8555-555555555551', 'Other Promoter Club', 'other-promoter-club');
insert into public.promoters (id, organization_id, display_name, first_name)
values ('f4555555-5555-4555-8555-555555555552', 'f4555555-5555-4555-8555-555555555551', 'Other RRPP', 'Other');

set local role anon;
select throws_ok(
  $$select count(*) from public.promoters$$,
  '42501', 'permission denied for table promoters',
  'anon cannot enumerate Promoters'
);
select throws_ok(
  $$select count(*) from public.promoter_sessions$$,
  '42501', 'permission denied for table promoter_sessions',
  'anon cannot read promoter sessions'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select count(*) from public.promoters where organization_id = 'f4555555-5555-4555-8555-555555555551'),
  0::bigint,
  'producer RLS hides another Organization Promoter'
);
select throws_ok(
  $$select count(*) from public.promoter_attributions$$,
  '42501', 'permission denied for table promoter_attributions',
  'producer cannot read private buyer attribution sessions directly'
);

select lives_ok(
  $$select public.duplicate_event_with_options(
    '44444444-4444-4444-8444-444444444444', 'Noche 2000 copia', 'noche-2000-copia-test',
    now() + interval '30 days', true
  )$$,
  'event duplication can preserve RRPP configuration'
);
reset role;
select is(
  (select status::text from public.events where slug = 'noche-2000-copia-test'),
  'draft',
  'duplicated Event always starts as draft'
);
select is(
  (select count(*) from public.event_promoters ep join public.events e on e.id = ep.event_id where e.slug = 'noche-2000-copia-test'),
  3::bigint,
  'duplication keeps active EventPromoters when selected'
);
select is(
  (select count(*) from public.promoter_commission_rules r join public.events e on e.id = r.event_id where e.slug = 'noche-2000-copia-test' and r.subject_type = 'ticket'),
  4::bigint,
  'duplication maps general and TicketType-specific rules'
);
select is(
  (select count(*) from public.orders o join public.events e on e.id = o.event_id where e.slug = 'noche-2000-copia-test'),
  0::bigint,
  'duplication never copies Orders or sales'
);
select is(
  (select count(*) from public.promoter_link_visits v join public.events e on e.id = v.event_id where e.slug = 'noche-2000-copia-test'),
  0::bigint,
  'duplication never copies Promoter visits'
);
select is(
  (select count(*) from public.promoter_commissions c join public.events e on e.id = c.event_id where e.slug = 'noche-2000-copia-test'),
  0::bigint,
  'duplication never copies historical commissions'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.duplicate_event_with_options(
    '44444444-4444-4444-8444-444444444444', 'Noche sin RRPP', 'noche-sin-rrpp-test',
    now() + interval '37 days', false
  )$$,
  'event duplication can explicitly omit RRPP'
);
reset role;
select is(
  (select count(*) from public.event_promoters ep join public.events e on e.id = ep.event_id where e.slug = 'noche-sin-rrpp-test'),
  0::bigint,
  'unchecked duplication creates no EventPromoters'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$insert into public.event_promoters (organization_id, event_id, promoter_id, public_slug)
    values (
      '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
      'f4000000-0000-4000-8000-000000000001', 'lucas-duplicate'
    )$$,
  '42501', 'permission denied for table event_promoters',
  'producer cannot bypass audited EventPromoter creation with a direct insert'
);

select * from finish();
rollback;
