begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Evento demo "Noche 2000" (Club Demo): tiene puertas con reglas. Dueño = 11111111..., ajeno = aaaaaaaa...
create function pg_temp.gates() returns bigint language sql as $$ select count(*) from public.access_gates where event_id = '44444444-4444-4444-8444-444444444444' $$;
create function pg_temp.active_gates() returns bigint language sql as $$ select count(*) from public.access_gates where event_id = '44444444-4444-4444-8444-444444444444' and active $$;

-- 1) Un tipo nuevo queda aceptado en todas las puertas.
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, max_per_order, active, sort_order)
values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Entrada de taquilla', 1000000, 'ARS', 50, 4, true, 99);
select is((select count(*) from public.access_gate_ticket_types r join public.ticket_types t on t.id = r.ticket_type_id where t.name = 'Entrada de taquilla' and t.event_id = '44444444-4444-4444-8444-444444444444'),
  pg_temp.gates(), 'un tipo de entrada nuevo queda aceptado en todas las puertas del evento');

-- 2) Un tipo huérfano (sin puerta) se arregla habilitándolo en todas las puertas operativas.
delete from public.access_gate_ticket_types where ticket_type_id = (select id from public.ticket_types where name = 'Entrada de taquilla' and event_id = '44444444-4444-4444-8444-444444444444');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select rules_added::bigint from public.fix_event_gate_coverage('44444444-4444-4444-8444-444444444444')), pg_temp.active_gates(), 'el arreglo habilita el tipo sin puerta en todas las puertas operativas');
select is((select gate_created from public.fix_event_gate_coverage('44444444-4444-4444-8444-444444444444')), false, 'si ya hay puertas no crea otra');
select is((select rules_added from public.fix_event_gate_coverage('44444444-4444-4444-8444-444444444444')), 0, 'repetir el arreglo no agrega nada');
select is((select count(*)::int from public.access_gate_ticket_types r join public.ticket_types t on t.id = r.ticket_type_id where t.name = 'Entrada de taquilla'), pg_temp.gates()::int, 'el tipo quedó aceptado en todas las puertas');

-- 3) El arreglo no toca tipos que ya pasan por alguna puerta (no pisa la configuración del productor).
reset role;
delete from public.access_gate_ticket_types where ticket_type_id = '55555555-5555-4555-8555-555555555552' and access_gate_id <> (select min(access_gate_id::text)::uuid from public.access_gate_ticket_types where ticket_type_id = '55555555-5555-4555-8555-555555555552');
select is((select count(*) from public.access_gate_ticket_types where ticket_type_id = '55555555-5555-4555-8555-555555555552')::int, 1, 'preparación: Preventa 2 pasa por una sola puerta');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select * from public.fix_event_gate_coverage('44444444-4444-4444-8444-444444444444')$$, 'el arreglo corre sin error');
select is((select count(*) from public.access_gate_ticket_types where ticket_type_id = '55555555-5555-4555-8555-555555555552')::int, 1, 'una entrada que ya tiene puerta no se expande a otras');

-- 4) Evento sin ninguna puerta: se crea "Acceso principal" con todos los tipos activos.
reset role;
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, max_per_order, active, sort_order)
values ('22222222-2222-4222-8222-222222222222', '55000000-0000-4000-8000-000000000001', 'General test', 500000, 'ARS', 20, 4, true, 0);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select gate_created from public.fix_event_gate_coverage('55000000-0000-4000-8000-000000000001')), true, 'un evento sin puertas recibe una puerta automática');
select is((select count(*) from public.access_gates where event_id = '55000000-0000-4000-8000-000000000001' and name = 'Acceso principal')::int, 1, 'la puerta automática se llama Acceso principal');
select ok((select count(*) from public.access_gate_ticket_types where event_id = '55000000-0000-4000-8000-000000000001') >= 1, 'la puerta automática acepta los tipos activos');

-- 5) Permisos.
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok($$select * from public.fix_event_gate_coverage('44444444-4444-4444-8444-444444444444')$$, 'P0001', 'NOT_ALLOWED', 'otra organización no puede arreglar las puertas');

select * from finish();
rollback;
