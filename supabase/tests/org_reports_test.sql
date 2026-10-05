begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixture propio: una orden pagada, una cortesía, una cancelada y una de otra organización no deben mezclarse.
insert into public.orders (id, organization_id, event_id, customer_id, channel, status, subtotal_amount, service_fee_amount, total_amount, currency, is_courtesy, created_at)
select 'ee000000-0000-4000-8000-000000000001', e.organization_id, e.id, c.id, 'ticket_web', 'paid', 1000000, 100000, 1100000, 'ARS', false, now()
from public.events e join public.customers c on c.organization_id = e.organization_id where e.id = '44444444-4444-4444-8444-444444444444' limit 1;
insert into public.order_items (organization_id, order_id, item_name, quantity, unit_price_amount, line_total_amount, currency, item_type, ticket_type_id)
select '22222222-2222-4222-8222-222222222222', 'ee000000-0000-4000-8000-000000000001', 'QA', 1, 1000000, 1000000, 'ARS', 'ticket', tt.id
from public.ticket_types tt where tt.event_id = '44444444-4444-4444-8444-444444444444' limit 1;
insert into public.orders (id, organization_id, event_id, customer_id, channel, status, subtotal_amount, service_fee_amount, total_amount, currency, is_courtesy, created_at)
select 'ee000000-0000-4000-8000-000000000002', e.organization_id, e.id, c.id, 'ticket_web', 'paid', 0, 0, 0, 'ARS', true, now()
from public.events e join public.customers c on c.organization_id = e.organization_id where e.id = '44444444-4444-4444-8444-444444444444' limit 1;
insert into public.orders (id, organization_id, event_id, customer_id, channel, status, subtotal_amount, service_fee_amount, total_amount, currency, is_courtesy, created_at)
select 'ee000000-0000-4000-8000-000000000003', e.organization_id, e.id, c.id, 'ticket_web', 'cancelled', 5000000, 0, 5000000, 'ARS', false, now()
from public.events e join public.customers c on c.organization_id = e.organization_id where e.id = '44444444-4444-4444-8444-444444444444' limit 1;
insert into public.order_items (organization_id, order_id, item_name, quantity, unit_price_amount, line_total_amount, currency, item_type, ticket_type_id)
select '22222222-2222-4222-8222-222222222222', 'ee000000-0000-4000-8000-000000000003', 'QA cancelada', 1, 5000000, 5000000, 'ARS', 'ticket', tt.id
from public.ticket_types tt where tt.event_id = '44444444-4444-4444-8444-444444444444' limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '1 hour', now() + interval '1 hour', '44444444-4444-4444-8444-444444444444')->'kpis'->'current'->>'revenue')::bigint,
  (select coalesce(sum(o.subtotal_amount), 0)::bigint from public.orders o where o.event_id = '44444444-4444-4444-8444-444444444444' and o.status = 'paid' and not o.is_courtesy and o.subtotal_amount > 0 and o.channel <> 'pos' and o.created_at >= now() - interval '1 hour'),
  'facturación = solo órdenes pagadas y no cortesía, sin cargo por servicio (la cancelada de $50.000 no entra)');
select is(
  (public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '1 hour', now() + interval '1 hour', '44444444-4444-4444-8444-444444444444')->'kpis'->'current'->>'ops')::bigint,
  (select count(*)::bigint from public.orders o where o.event_id = '44444444-4444-4444-8444-444444444444' and o.status = 'paid' and not o.is_courtesy and o.subtotal_amount > 0 and o.channel <> 'pos' and o.created_at >= now() - interval '1 hour'),
  'operaciones = órdenes pagadas con importe (la cortesía y la cancelada no cuentan)');
select is(
  public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '1 hour', now() + interval '1 hour', '44444444-4444-4444-8444-444444444444', 'day', 'box_office')->'kpis'->'current'->>'revenue',
  '0', 'el filtro de canal taquilla excluye las ventas online');
select is(
  jsonb_array_length(public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '1 hour', now() + interval '1 hour', '44444444-4444-4444-8444-444444444444')->'series'),
  1, 'la serie agrupa por día');
select throws_ok($$select public.get_org_report('22222222-2222-4222-8222-222222222222', now(), now() - interval '1 day')$$, 'P0001', 'INVALID_RANGE', 'rechaza rangos invertidos');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok($$select public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '30 days', now())$$, 'P0001', 'NOT_ALLOWED', 'otro productor no puede leer los reportes de esta organización');
select throws_ok($$select public.get_org_report('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now() - interval '30 days', now())$$, 'P0001', 'NOT_ALLOWED', 'ni pidiendo una organización que no es suya');

reset role;
set local role anon;
select throws_ok($$select public.get_org_report('22222222-2222-4222-8222-222222222222', now() - interval '30 days', now())$$, '42501', null, 'sin sesión no se puede ejecutar');

select * from finish();
rollback;
