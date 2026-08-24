begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$select public.update_event_details(
    '44444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'Noche 2000 editada',
    'Información actualizada',
    now() + interval '15 days',
    now() + interval '15 days' - interval '1 hour',
    now() + interval '15 days' + interval '7 hours',
    650,
    true
  )$$,
  'an organization owner can edit a published event'
);

select is((select name from public.events where id = '44444444-4444-4444-8444-444444444444'), 'Noche 2000 editada', 'event name is updated');
select is((select require_document from public.events where id = '44444444-4444-4444-8444-444444444444'), true, 'document requirement is updated');
select is(
  (select min(valid_from) from public.tickets where event_id = '44444444-4444-4444-8444-444444444444' and status = 'valid'),
  (select doors_open_at from public.events where id = '44444444-4444-4444-8444-444444444444'),
  'issued tickets follow the edited access window'
);
select is((select count(*) from public.audit_logs where entity_id = '44444444-4444-4444-8444-444444444444' and action = 'event.updated'), 1::bigint, 'event update is audited');

select throws_ok(
  $$select public.update_event_details(
    '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
    'Noche 2000', '', now() + interval '15 days', null, null, 620, false
  )$$,
  'P0001', 'CONFIGURED_CAPACITY_EXCEEDED', 'capacity cannot be reduced below configured inventory'
);

select throws_ok(
  $$select public.update_event_details(
    '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
    'Noche 2000', '', now() + interval '15 days', null, null, 701, false
  )$$,
  'P0001', 'VENUE_CAPACITY_EXCEEDED', 'capacity cannot exceed venue capacity'
);

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.update_event_details(
    '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
    'Intrusión', '', now() + interval '15 days', null, null, 650, false
  )$$,
  'P0001', 'NOT_ALLOWED', 'another user cannot edit the event'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.update_event_details(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,integer,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.update_event_details(uuid,uuid,text,text,timestamptz,timestamptz,timestamptz,integer,boolean)', 'execute'),
  'only authenticated users can call event editing'
);

select * from finish();
rollback;
