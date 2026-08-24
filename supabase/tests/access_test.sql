begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Isolated scanner sessions for deterministic checks inside this transaction.
insert into public.scanner_device_authorizations (
  id, organization_id, event_id, access_gate_id, label, permission, pin_hash,
  code_expires_at, session_expires_at, activation_count, activated_at, created_by
) values
  ('a3f00000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000001', 'Test scanner', 'scanner', null, now() + interval '1 minute', now() + interval '1 hour', 1, now(), '11111111-1111-4111-8111-111111111111'),
  ('a3f00000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000001', 'Test supervisor', 'supervisor', null, now() + interval '1 minute', now() + interval '1 hour', 1, now(), '11111111-1111-4111-8111-111111111111'),
  ('a3f00000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000002', 'Test VIP', 'scanner', null, now() + interval '1 minute', now() + interval '1 hour', 1, now(), '11111111-1111-4111-8111-111111111111');

insert into public.scanner_sessions (
  id, authorization_id, organization_id, event_id, access_gate_id,
  permission, session_token_hash, expires_at
) values
  ('a3f00000-0000-4000-8000-000000000011', 'a3f00000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000001', 'scanner', repeat('a', 64), now() + interval '1 hour'),
  ('a3f00000-0000-4000-8000-000000000012', 'a3f00000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000001', 'supervisor', repeat('b', 64), now() + interval '1 hour'),
  ('a3f00000-0000-4000-8000-000000000013', 'a3f00000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000002', 'scanner', repeat('c', 64), now() + interval '1 hour');

delete from public.checkins where ticket_id between 'a3000000-0000-4000-8000-000000000051' and 'a3000000-0000-4000-8000-000000000058';
update public.tickets set used_entries = 0 where id in (
  'a3000000-0000-4000-8000-000000000051',
  'a3000000-0000-4000-8000-000000000055',
  'a3000000-0000-4000-8000-000000000056'
);

select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000101'
  )), 'valid', 'a valid QR increments atomically'
);
select is((select used_entries from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'), 1, 'valid scan increments used entries');
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000102'
  )), 'already_used', 'a consumed one-entry Ticket is rejected'
);
select is(
  (select first_used_gate_name from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000102'
  )), 'Acceso principal', 'already-used response includes the first gate'
);
select is(
  (select result::text from public.check_in_ticket(repeat('a', 64), repeat('0', 64), 'a3f00000-0000-4000-8000-000000000103')),
  'invalid', 'an unknown QR is invalid'
);
select ok(
  exists(select 1 from public.checkins where idempotency_key = 'a3f00000-0000-4000-8000-000000000103' and result = 'invalid'),
  'invalid attempts are logged without the raw payload'
);
update public.scanner_sessions set scan_window_started_at = now(), scan_attempts = 60
where id = 'a3f00000-0000-4000-8000-000000000011';
select is(
  (select result::text from public.check_in_ticket(repeat('a', 64), repeat('0', 64), 'a3f00000-0000-4000-8000-000000000120')),
  'rate_limited', 'scanner validation is rate limited per session'
);
update public.scanner_sessions set scan_window_started_at = now(), scan_attempts = 0
where id = 'a3f00000-0000-4000-8000-000000000011';
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000104'
  )), 'wrong_event', 'a Ticket for another Event is rejected'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000105'
  )), 'wrong_gate', 'a VIP Ticket is rejected at the general gate'
);
select is(
  (select suggested_gate_name from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000105'
  )), 'Acceso VIP', 'wrong gate response suggests an accepted gate'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('c', 64),
    encode(extensions.digest(convert_to('NLOS1:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000106'
  )), 'valid', 'the same VIP Ticket is valid at its accepted gate'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000107'
  )), 'too_early', 'a Ticket before valid_from is rejected'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000108'
  )), 'too_late', 'a Ticket after valid_until is rejected'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000109'
  )), 'refunded', 'a refunded Ticket is rejected'
);

update public.tickets set status = 'cancelled', cancelled_at = now()
where id = 'a3000000-0000-4000-8000-000000000051';
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000110'
  )), 'cancelled', 'a cancelled Ticket is rejected'
);
update public.tickets set status = 'valid', cancelled_at = null, used_entries = 0
where id = 'a3000000-0000-4000-8000-000000000051';

select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000111'
  )), 'valid', 'first entry of a multi-entry Ticket is valid'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000112'
  )), 'valid', 'second entry of a multi-entry Ticket is valid'
);
select is(
  (select result::text from public.check_in_ticket(
    repeat('a', 64),
    encode(extensions.digest(convert_to('NLOS1:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'UTF8'), 'sha256'), 'hex'),
    'a3f00000-0000-4000-8000-000000000113'
  )), 'already_used', 'multi-entry Ticket rejects entry beyond max_entries'
);

update public.scanner_sessions set revoked_at = now() where id = 'a3f00000-0000-4000-8000-000000000011';
select is(
  (select result::text from public.check_in_ticket(repeat('a', 64), repeat('0', 64), 'a3f00000-0000-4000-8000-000000000114')),
  'device_not_authorized', 'a revoked scanner session is rejected'
);
update public.scanner_sessions set revoked_at = null where id = 'a3f00000-0000-4000-8000-000000000011';
update public.scanner_device_authorizations set revoked_at = now() where id = 'a3f00000-0000-4000-8000-000000000001';
select is(
  (select result::text from public.check_in_ticket(repeat('a', 64), repeat('0', 64), 'a3f00000-0000-4000-8000-000000000115')),
  'device_not_authorized', 'revoking device authorization invalidates its session'
);
update public.scanner_device_authorizations set revoked_at = null where id = 'a3f00000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.get_supervisor_ticket_preview(repeat('a', 64), 'NVAL-D1')$$,
  'P0001', 'SUPERVISOR_REQUIRED', 'normal scanner cannot use manual lookup'
);
select throws_ok(
  $$select public.supervisor_override_checkin(repeat('a', 64), 'a3f00000-0000-4000-8000-000000000105', 'wrong_gate', 'a3f00000-0000-4000-8000-000000000116')$$,
  'P0001', 'SUPERVISOR_REQUIRED', 'normal scanner cannot override a rejection'
);
update public.scanner_sessions set manual_window_started_at = now(), manual_attempts = 20
where id = 'a3f00000-0000-4000-8000-000000000012';
select throws_ok(
  $$select public.get_supervisor_ticket_preview(repeat('b', 64), 'NVAL-D1')$$,
  'P0001', 'RATE_LIMITED', 'supervisor manual lookup is rate limited per session'
);
update public.scanner_sessions set manual_window_started_at = now(), manual_attempts = 0
where id = 'a3f00000-0000-4000-8000-000000000012';

update public.tickets set used_entries = 0 where id = 'a3000000-0000-4000-8000-000000000056';
select is(
  (public.supervisor_override_checkin(
    repeat('b', 64),
    (select id from public.checkins where idempotency_key = 'a3f00000-0000-4000-8000-000000000105'),
    'wrong_gate', 'a3f00000-0000-4000-8000-000000000117'
  )->>'result'), 'valid', 'supervisor can approve an auditable wrong-gate exception'
);
select ok(
  exists(select 1 from public.checkins where idempotency_key = 'a3f00000-0000-4000-8000-000000000117' and override and override_reason = 'wrong_gate'),
  'supervisor override records reason and session'
);
update public.tickets set used_entries = 0 where id = 'a3000000-0000-4000-8000-000000000051';
select is(
  (public.supervisor_manual_checkin(repeat('b', 64), 'NVAL-D1', 'a3f00000-0000-4000-8000-000000000118')->>'result'),
  'valid', 'supervisor can confirm a manual short-code check-in'
);
select ok(
  exists(select 1 from public.checkins where idempotency_key = 'a3f00000-0000-4000-8000-000000000118' and source = 'manual' and override),
  'manual admission is explicitly audited'
);

insert into public.scanner_device_authorizations (
  id, organization_id, event_id, access_gate_id, label, permission, pin_hash,
  code_expires_at, session_expires_at, created_by
) values (
  'a3f00000-0000-4000-8000-000000000020', '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000001',
  'Activation test', 'scanner', extensions.crypt('987654', extensions.gen_salt('bf', 10)),
  now() + interval '30 minutes', now() + interval '1 hour', '11111111-1111-4111-8111-111111111111'
);
select isnt(
  (select pin_hash from public.scanner_device_authorizations where id = 'a3f00000-0000-4000-8000-000000000020'),
  '987654', 'scanner PIN is never stored in plaintext'
);
select is(
  (select activation_status from public.activate_scanner_device('987654', repeat('d', 64), repeat('1', 64))),
  'ok', 'valid temporary PIN activates one scanner session'
);
select is(
  (select activation_status from public.activate_scanner_device('987654', repeat('e', 64), repeat('2', 64))),
  'invalid', 'activation PIN is one-time use'
);

select is(
  (select activation_status from public.activate_scanner_device('000000', repeat('3', 64), repeat('f', 64))),
  'invalid', 'first wrong activation PIN is rejected'
);
select * from public.activate_scanner_device('000000', repeat('4', 64), repeat('f', 64));
select * from public.activate_scanner_device('000000', repeat('5', 64), repeat('f', 64));
select * from public.activate_scanner_device('000000', repeat('6', 64), repeat('f', 64));
select is(
  (select activation_status from public.activate_scanner_device('000000', repeat('7', 64), repeat('f', 64))),
  'rate_limited', 'fifth wrong PIN activates a temporary rate limit'
);
select is(
  (select activation_status from public.activate_scanner_device('320001', repeat('8', 64), repeat('f', 64))),
  'rate_limited', 'rate limit also blocks a subsequently correct PIN'
);

insert into public.organizations (id, name, slug)
values ('a3f00000-0000-4000-8000-000000000030', 'Foreign Access Org', 'foreign-access-org');
insert into public.venues (id, organization_id, name, address, city, province, capacity)
values ('a3f00000-0000-4000-8000-000000000031', 'a3f00000-0000-4000-8000-000000000030', 'Foreign Venue', 'Foreign 1', 'Mendoza', 'Mendoza', 10);
insert into public.events (id, organization_id, venue_id, name, slug, starts_at, status, capacity, created_by)
values ('a3f00000-0000-4000-8000-000000000032', 'a3f00000-0000-4000-8000-000000000030', 'a3f00000-0000-4000-8000-000000000031', 'Foreign Event', 'foreign-access-event', now() + interval '1 day', 'draft', 10, '11111111-1111-4111-8111-111111111111');
insert into public.access_gates (id, organization_id, event_id, name)
values ('a3f00000-0000-4000-8000-000000000033', 'a3f00000-0000-4000-8000-000000000030', 'a3f00000-0000-4000-8000-000000000032', 'Foreign gate');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*) from public.access_gates where event_id = '44444444-4444-4444-8444-444444444444'), 2::bigint, 'manager can read own Event gates');
select is((select count(*) from public.access_gates where organization_id = 'a3f00000-0000-4000-8000-000000000030'), 0::bigint, 'RLS hides another tenant access configuration');
reset role;

-- Distinct requests exercise the same invariant that the row lock protects under concurrency.
update public.tickets set status = 'valid', cancelled_at = null, used_entries = 0
where id = 'a3000000-0000-4000-8000-000000000051';
create temporary table competing_results (result text);
insert into competing_results
select result::text from public.check_in_ticket(
  repeat('a', 64), encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','UTF8'),'sha256'),'hex'),
  'a3f00000-0000-4000-8000-000000000201'
);
insert into competing_results
select result::text from public.check_in_ticket(
  repeat('a', 64), encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','UTF8'),'sha256'),'hex'),
  'a3f00000-0000-4000-8000-000000000202'
);
select is((select count(*) from competing_results where result = 'valid'), 1::bigint, 'competing scans produce exactly one valid admission');
select is((select count(*) from competing_results where result = 'already_used'), 1::bigint, 'the competing loser observes already_used');

select * from finish();
rollback;
