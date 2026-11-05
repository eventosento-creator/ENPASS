begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.club_settings (organization_id, enabled, public_listing_status) values ('22222222-2222-4222-8222-222222222222', true, 'approved')
  on conflict (organization_id) do update set enabled = true, public_listing_status = 'approved';
insert into public.membership_categories (id, organization_id, name, monthly_fee_amount) values ('cc000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Solicitud test', 10000);

select lives_ok($$select public.submit_club_membership_request('22222222-2222-4222-8222-222222222222', 'cc000000-0000-4000-8000-000000000001', 'Marta', 'Gómez', 'marta-sol@test.local', null, '30999888', null, null, 'Lola', 'Pérez', null, date '2015-05-10')$$, 'una mamá solicita para su hija');
select lives_ok($$select public.submit_club_membership_request('22222222-2222-4222-8222-222222222222', 'cc000000-0000-4000-8000-000000000001', 'Marta', 'Gómez', 'marta-sol@test.local', null, '30999888', null, null, 'Sofi', 'Pérez', null, date '2018-02-01')$$, 'y puede pedir otra para su segunda hija con el mismo mail');
select throws_ok($$select public.submit_club_membership_request('22222222-2222-4222-8222-222222222222', 'cc000000-0000-4000-8000-000000000001', 'Marta', 'Gómez', 'marta-sol@test.local', null, '30999888', null, null, 'Lola', 'Pérez', null, date '2015-05-10')$$, 'P0001', 'DUPLICATE_REQUEST', 'pero no repetir la de la misma alumna');
select throws_ok($$select public.submit_club_membership_request('22222222-2222-4222-8222-222222222222', 'cc000000-0000-4000-8000-000000000001', 'Ana', 'López', 'ana-sol@test.local', null, null, null, null, 'Mica', 'López', null, null)$$, 'P0001', 'INVALID_STUDENT_DATA', 'sin fecha de nacimiento no se acepta');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select * from public.approve_club_membership_request((select id from public.club_membership_requests where student_first_name = 'Lola' and email = 'marta-sol@test.local'), 'S-1')$$, 'el club aprueba la solicitud de Lola');
select lives_ok($$select * from public.approve_club_membership_request((select id from public.club_membership_requests where student_first_name = 'Sofi' and email = 'marta-sol@test.local'), 'S-2')$$, 'y la de Sofi');
select is((select count(*)::int from public.memberships where member_number in ('S-1', 'S-2') and student_first_name is not null and customer_id = (select id from public.customers where email = 'marta-sol@test.local')), 2, 'quedan dos alumnas con la misma tutora');

select * from finish();
rollback;
