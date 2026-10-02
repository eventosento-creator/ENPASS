begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.club_settings (organization_id, enabled) values ('22222222-2222-4222-8222-222222222222', true)
  on conflict (organization_id) do update set enabled = true, debt_blocks_entry = false;
insert into public.membership_categories (id, organization_id, name, monthly_fee_amount)
values ('ca000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'QA General', 500000);
insert into public.customers (id, organization_id, first_name, last_name, email, document)
values ('ca000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Mia', 'Socia', 'mia-qa@example.com', '40.111.222');
insert into public.memberships (id, organization_id, customer_id, membership_category_id, member_number, created_by)
values ('ca000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001', 'QA7', '11111111-1111-4111-8111-111111111111');
insert into public.membership_dues (id, organization_id, membership_id, period, amount, due_date)
values ('ca000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'ca000000-0000-4000-8000-000000000003', '2026-08-01', 500000, '2026-08-05');

set local role service_role;
select is((select count(*) from public.member_request_password_token('22222222-2222-4222-8222-222222222222', '40111222', repeat('a', 64))), 1::bigint, 'a member requests a password link by DNI (dots ignored)');
select is((select count(*) from public.member_request_password_token('22222222-2222-4222-8222-222222222222', 'mia-qa@example.com', repeat('b', 64))), 0::bigint, 'a second request within a minute is skipped');
select is((select count(*) from public.member_request_password_token('22222222-2222-4222-8222-222222222222', '99999999', repeat('c', 64))), 0::bigint, 'an unknown DNI reveals nothing');
select throws_ok($$select public.member_set_password(repeat('a', 64), 'corta', repeat('1', 64), now() + interval '1 day')$$, 'P0001', 'WEAK_PASSWORD', 'short passwords are rejected');
select is(public.member_set_password(repeat('a', 64), 'MiClave2026', repeat('1', 64), now() + interval '1 day'), 'ca000000-0000-4000-8000-000000000003'::uuid, 'the emailed token sets the password and logs in');
select is(public.member_set_password(repeat('a', 64), 'OtraClave123', repeat('2', 64), now() + interval '1 day'), null::uuid, 'the token is single use');
select is((select login_status from public.member_login('22222222-2222-4222-8222-222222222222', 'mia-qa@example.com', 'mal', repeat('3', 64), now() + interval '1 day')), 'invalid', 'a wrong password is rejected');
select is((select login_status from public.member_login('22222222-2222-4222-8222-222222222222', '40.111.222', 'MiClave2026', repeat('4', 64), now() + interval '1 day')), 'ok', 'login works with DNI and password');
select is((select overdue_amount from public.member_get_profile(repeat('4', 64))), 500000::bigint, 'the profile reports the overdue amount');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.create_club_door_device('22222222-2222-4222-8222-222222222222', 'Puerta QA', '135790', now() + interval '10 minutes')$$, 'owner creates a door device');

set local role service_role;
select is((select activation_status from public.activate_club_door_device('135790', repeat('5', 64), repeat('6', 64))), 'ok', 'the PIN activates the door');
select is((select result from public.check_in_member(repeat('5', 64), 'ca000000-0000-4000-8000-000000000003')), 'allowed_with_debt', 'overdue dues only warn while blocking is off');
update public.club_settings set debt_blocks_entry = true where organization_id = '22222222-2222-4222-8222-222222222222';
select is((select result from public.check_in_member(repeat('5', 64), 'ca000000-0000-4000-8000-000000000003')), 'denied_debt', 'overdue dues are rejected once blocking is on');
update public.membership_dues set paid_at = now(), paid_amount = amount, payment_method = 'cash' where id = 'ca000000-0000-4000-8000-000000000004';
select is((select result from public.check_in_member(repeat('5', 64), 'ca000000-0000-4000-8000-000000000003')), 'allowed', 'a member up to date enters');
select is((select activation_status from public.activate_club_door_device('135790', repeat('7', 64), repeat('6', 64))), 'ok', 'the same PIN reopens the same door');
select is((select result from public.check_in_member(repeat('5', 64), 'ca000000-0000-4000-8000-000000000003')), 'device_not_authorized', 'reopening ends the previous door session');

reset role;
insert into public.customers (id, organization_id, first_name, last_name, email, document)
values ('ca000000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', 'Otro', 'Socio', 'otro-qa@example.com', '40111222');
select throws_ok(
  $$insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by)
    values ('22222222-2222-4222-8222-222222222222', 'ca000000-0000-4000-8000-000000000012', 'ca000000-0000-4000-8000-000000000001', 'QA8', '11111111-1111-4111-8111-111111111111')$$,
  'P0001', 'DOCUMENT_TAKEN', 'a second member cannot share a DNI (dots and spaces ignored)');
insert into public.customers (id, organization_id, first_name, last_name, email, document)
values ('ca000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'Libre', 'Socio', 'libre-qa@example.com', '30999888');
insert into public.memberships (id, organization_id, customer_id, membership_category_id, member_number, created_by)
values ('ca000000-0000-4000-8000-000000000014', '22222222-2222-4222-8222-222222222222', 'ca000000-0000-4000-8000-000000000013', 'ca000000-0000-4000-8000-000000000001', 'QA9', '11111111-1111-4111-8111-111111111111');
select lives_ok($$select 1$$, 'a member with a different DNI is accepted');
select throws_ok(
  $$update public.customers set document = '40.111.222' where id = 'ca000000-0000-4000-8000-000000000013'$$,
  'P0001', 'DOCUMENT_TAKEN', 'an existing member cannot take another member''s DNI');

select * from finish();
rollback;
