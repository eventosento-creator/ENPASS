begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select public.upsert_membership_category('22222222-2222-4222-8222-222222222222', null, 'Academia test', 20000, true);
select set_config('t.cat', (select id::text from public.membership_categories where organization_id = '22222222-2222-4222-8222-222222222222' and name = 'Academia test'), true);

-- Una mamá, dos hijas: el tutor es el mismo customer.
select lives_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'T-1', 'Marta', 'Gómez', 'marta@test.local', '2615550000', '30111222', null, null, 'Lola', 'Pérez', '50111222', date '2015-05-10')$$, current_setting('t.cat')), 'alta de la primera alumna con su tutor');
select lives_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'T-2', 'Marta', 'Gómez', 'marta@test.local', '2615550000', '30111222', null, null, 'Sofi', 'Pérez', null, date '2018-02-01')$$, current_setting('t.cat')), 'la misma mamá puede anotar a una segunda hija');
select is((select count(distinct customer_id)::int from public.memberships where member_number in ('T-1', 'T-2')), 1, 'las dos membresías tienen el mismo tutor');
select throws_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'T-3', 'Ana', 'López', 'ana@test.local', null, null, null, null, 'Mica', 'López', '50111222', date '2016-01-01')$$, current_setting('t.cat')), 'P0001', 'DOCUMENT_TAKEN', 'el DNI de un alumno no se repite');
select throws_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'T-4', 'Ana', 'López', 'ana@test.local', null, null, null, null, 'Mica', 'López', null, null)$$, current_setting('t.cat')), 'P0001', 'INVALID_STUDENT_DATA', 'el alumno necesita fecha de nacimiento');

-- Adultos: sigue valiendo una membresía por persona.
select lives_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'A-1', 'Pablo', 'Ruiz', 'pablo@test.local', null, null)$$, current_setting('t.cat')), 'alta de un adulto');
select throws_ok(format($$select * from public.create_membership('22222222-2222-4222-8222-222222222222', %L, 'A-2', 'Pablo', 'Ruiz', 'pablo@test.local', null, null)$$, current_setting('t.cat')), 'P0001', 'CUSTOMER_ALREADY_MEMBER', 'un adulto no puede ser socio dos veces');

-- Listado y ficha muestran a la alumna y no a la mamá.
select is((select first_name from public.search_memberships('22222222-2222-4222-8222-222222222222', 'Lola') where member_number = 'T-1'), 'Lola', 'el listado muestra el nombre de la alumna');
select is((select last_name from public.search_memberships('22222222-2222-4222-8222-222222222222', 'Pérez') where member_number = 'T-2'), 'Pérez', 'se busca por apellido de la alumna');
select is((select guardian_first_name from public.get_membership_detail((select id from public.memberships where member_number = 'T-1'))), 'Marta', 'la ficha muestra al tutor');
select is((select guardian_first_name from public.get_membership_detail((select id from public.memberships where member_number = 'A-1'))), null, 'un adulto no tiene tutor');

select * from finish();
rollback;
