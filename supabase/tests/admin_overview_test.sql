begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-0000000000c1', 'admin-ov@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-0000000000c2', 'plain-ov@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into public.platform_admins (user_id) values ('bb000000-0000-4000-8000-0000000000c1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
select throws_ok($$select public.admin_overview(now() - interval '30 days', now())$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no ve el resumen');
select throws_ok($$select * from public.admin_list_events('all', null, null, 10)$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no lista eventos');
select throws_ok($$select public.admin_event_detail('44444444-4444-4444-8444-444444444444')$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no ve el detalle de un evento');
select throws_ok($$select * from public.admin_clubs_overview()$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no lista clubes');
select throws_ok($$select public.admin_club_detail('22222222-2222-4222-8222-222222222222')$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no ve el detalle de un club');
select throws_ok($$select * from public.admin_list_producers()$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no lista productores');

set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select is(public.admin_overview(now() - interval '3650 days', now() + interval '1 day')->>'sales',
  (select coalesce(sum(subtotal_amount), 0)::text from public.orders where status = 'paid' and not is_courtesy), 'las ventas del resumen son la suma del precio base de las órdenes pagadas');
select is(public.admin_overview(now() - interval '3650 days', now() + interval '1 day')->>'fees',
  (select coalesce(sum(service_fee_amount), 0)::text from public.orders where status = 'paid' and not is_courtesy), 'el cargo de ENPASS se informa aparte de las ventas');
select ok((public.admin_overview(now() - interval '3650 days', now() + interval '1 day')->'actions') ? 'transfers_review', 'el resumen incluye los pendientes de acción');
select is((select count(*)::int from public.admin_list_events('all', null, null, 300)), (select count(*)::int from public.events), 'la lista "todos" trae todos los eventos');
select is((select count(*)::int from public.admin_list_events('all', 'zzz-no-existe', null, 300)), 0, 'el buscador filtra por nombre');
select is(public.admin_event_detail('44444444-4444-4444-8444-444444444444')->'event'->>'name', (select name from public.events where id = '44444444-4444-4444-8444-444444444444'), 'el detalle del evento trae su nombre');
select is((select count(*)::int from public.admin_clubs_overview()), (select count(*)::int from public.club_settings where enabled), 'la lista de clubes trae los clubes activos');
select is((select count(*)::int from public.admin_list_producers()), (select count(*)::int from public.organizations), 'la lista de productores trae todas las cuentas');

select * from finish();
rollback;
