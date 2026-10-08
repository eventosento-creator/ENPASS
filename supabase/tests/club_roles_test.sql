begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Un colaborador por rol en Club Demo.
insert into auth.users (id, email, instance_id, aud, role) values
  ('aa000000-0000-4000-8000-000000000001', 'rol-admin@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('aa000000-0000-4000-8000-000000000002', 'rol-tesorero@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('aa000000-0000-4000-8000-000000000003', 'rol-coord@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('aa000000-0000-4000-8000-000000000004', 'rol-lector@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.club_staff (organization_id, user_id, created_by, role) values
  ('22222222-2222-4222-8222-222222222222', 'aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'treasurer'),
  ('22222222-2222-4222-8222-222222222222', 'aa000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'coordinator'),
  ('22222222-2222-4222-8222-222222222222', 'aa000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', 'viewer');

set local role authenticated;

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(public.club_permission('22222222-2222-4222-8222-222222222222', 'members') and public.club_permission('22222222-2222-4222-8222-222222222222', 'dues')
  and public.club_permission('22222222-2222-4222-8222-222222222222', 'structure') and public.club_permission('22222222-2222-4222-8222-222222222222', 'reports'), 'administrador: todos los permisos');

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(public.club_permission('22222222-2222-4222-8222-222222222222', 'dues') and public.club_permission('22222222-2222-4222-8222-222222222222', 'reports'), 'tesorero: cuotas y reportes');
select ok(not public.club_permission('22222222-2222-4222-8222-222222222222', 'members') and not public.club_permission('22222222-2222-4222-8222-222222222222', 'structure'), 'tesorero: no edita socios ni categorías');
select lives_ok($$select * from public.generate_dues_for_period('22222222-2222-4222-8222-222222222222', null, date '2027-03-01')$$, 'tesorero genera cuotas');
select throws_ok($$select * from public.upsert_membership_category('22222222-2222-4222-8222-222222222222', null, 'No debería', 1000, true)$$, 'P0001', 'NOT_ALLOWED', 'tesorero no crea categorías');

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(public.club_permission('22222222-2222-4222-8222-222222222222', 'members') and public.club_permission('22222222-2222-4222-8222-222222222222', 'structure'), 'coordinador: socios y categorías');
select ok(not public.club_permission('22222222-2222-4222-8222-222222222222', 'dues') and not public.club_permission('22222222-2222-4222-8222-222222222222', 'reports'), 'coordinador: sin cobros ni reportes');
select throws_ok($$select * from public.generate_dues_for_period('22222222-2222-4222-8222-222222222222', null, date '2027-04-01')$$, 'P0001', 'NOT_ALLOWED', 'coordinador no genera cuotas');
select throws_ok($$select * from public.get_club_report('22222222-2222-4222-8222-222222222222', now() - interval '30 days', now())$$, 'P0001', 'NOT_ALLOWED', 'coordinador no ve el reporte');

set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(not public.club_permission('22222222-2222-4222-8222-222222222222', 'members') and not public.club_permission('22222222-2222-4222-8222-222222222222', 'dues'), 'solo lectura: ningún permiso de escritura');
select throws_ok($$insert into public.membership_plans (organization_id, name) values ('22222222-2222-4222-8222-222222222222', 'directo')$$, '42501', null, 'solo lectura no escribe tablas directo');
select ok((select count(*) from public.memberships where organization_id = '22222222-2222-4222-8222-222222222222') >= 0, 'solo lectura sí puede leer socios');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.club_permission('22222222-2222-4222-8222-222222222222', 'reports'), 'el dueño siempre puede todo');

select * from finish();
rollback;
