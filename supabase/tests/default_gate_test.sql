begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Evento sin puertas (55000000-...01, org Club Demo) y evento con puertas (44444444-..., "Noche 2000").
delete from public.access_gate_ticket_types where event_id = '55000000-0000-4000-8000-000000000001';
delete from public.access_gates where event_id = '55000000-0000-4000-8000-000000000001';
select is((select count(*) from public.access_gates where event_id = '55000000-0000-4000-8000-000000000001')::int, 0, 'preparación: el evento no tiene puertas');

-- 1) El primer tipo de entrada crea "Acceso principal" y queda aceptado.
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, max_per_order, active, sort_order)
values ('22222222-2222-4222-8222-222222222222', '55000000-0000-4000-8000-000000000001', 'Gratis 1am', 0, 'ARS', 50, 4, true, 1);
select is((select count(*) from public.access_gates where event_id = '55000000-0000-4000-8000-000000000001' and name = 'Acceso principal')::int, 1, 'al cargar la primera entrada se crea la puerta "Acceso principal"');
select is((select count(*) from public.access_gate_ticket_types r join public.ticket_types t on t.id = r.ticket_type_id where t.name = 'Gratis 1am' and t.event_id = '55000000-0000-4000-8000-000000000001')::int, 1, 'la puerta acepta ese tipo de entrada');

-- 2) El segundo tipo no crea otra puerta y también queda aceptado.
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, max_per_order, active, sort_order)
values ('22222222-2222-4222-8222-222222222222', '55000000-0000-4000-8000-000000000001', 'Pago 2:30am', 1400000, 'ARS', 50, 4, true, 2);
select is((select count(*) from public.access_gates where event_id = '55000000-0000-4000-8000-000000000001')::int, 1, 'un segundo tipo no crea una segunda puerta');
select is((select count(*) from public.access_gate_ticket_types where event_id = '55000000-0000-4000-8000-000000000001')::int, 2, 'los dos tipos quedan aceptados en la puerta');

-- 3) Un evento que ya tenía puertas no recibe una nueva ni se le toca la configuración.
create function pg_temp.noche_gates() returns bigint language sql as $$ select count(*) from public.access_gates where event_id = '44444444-4444-4444-8444-444444444444' $$;
create temp table before_gates as select pg_temp.noche_gates() as n;
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, max_per_order, active, sort_order)
values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Entrada nueva', 1000000, 'ARS', 5, 4, true, 98);
select is(pg_temp.noche_gates(), (select n from before_gates), 'un evento con puertas no recibe una puerta nueva');
select is((select count(*) from public.access_gate_ticket_types r join public.ticket_types t on t.id = r.ticket_type_id where t.name = 'Entrada nueva' and t.event_id = '44444444-4444-4444-8444-444444444444')::int, pg_temp.noche_gates()::int, 'la entrada nueva queda aceptada en todas las puertas existentes');

select * from finish();
rollback;
