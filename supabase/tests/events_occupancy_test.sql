begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select coalesce(sum(tickets_sold), 0)::bigint from public.get_events_occupancy('22222222-2222-4222-8222-222222222222')),
  (select count(*) from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222' and status = 'valid'),
  'el dueño ve las entradas vendidas vigentes de sus eventos');
select ok((select count(*) from public.get_events_occupancy('22222222-2222-4222-8222-222222222222') where tickets_sold <= 0) = 0, 'solo aparecen eventos con ventas');

reset role;
update public.tickets set status = 'cancelled', cancelled_at = now()
  where id = (select id from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222' and status = 'valid' limit 1);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select coalesce(sum(tickets_sold), 0)::bigint from public.get_events_occupancy('22222222-2222-4222-8222-222222222222')),
  (select count(*) from public.tickets where organization_id = '22222222-2222-4222-8222-222222222222' and status = 'valid'),
  'una entrada anulada deja de contar');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok($$select * from public.get_events_occupancy('22222222-2222-4222-8222-222222222222')$$, 'P0001', 'NOT_ALLOWED', 'otra organización no ve las ventas');
reset role;
set local role anon;
select throws_ok($$select * from public.get_events_occupancy('22222222-2222-4222-8222-222222222222')$$, '42501', null, 'sin sesión no se puede consultar');
reset role;

select * from finish();
rollback;
