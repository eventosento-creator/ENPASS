begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select is((select profile::text from public.events where id = '44444444-4444-4444-8444-444444444444'), 'nightlife', 'existing events are backfilled as nightlife');
select ok((select tickets_enabled and promoters_enabled and tables_enabled and access_enabled from public.events where id = '44444444-4444-4444-8444-444444444444'), 'existing nightlife capabilities preserve the full journey');
select is((select profile::text from public.events where id = '55000000-0000-4000-8000-000000000001'), 'conference', 'conference fixture has a stable profile');
select ok((select tickets_enabled and not promoters_enabled and not tables_enabled and access_enabled from public.events where id = '55000000-0000-4000-8000-000000000001'), 'conference fixture only enables tickets and access');
select throws_ok(
  $$insert into public.events (organization_id, venue_id, name, slug, starts_at, capacity, created_by, profile)
    values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Invalid', 'invalid-profile', now() + interval '1 day', 10, '11111111-1111-4111-8111-111111111111', 'wedding')$$,
  '22P02', null, 'invalid profiles are rejected by the enum'
);
select is((select count(*) from public.get_public_event_by_slug('tech-mendoza-2026')), 1::bigint, 'public event projection resolves published event');
select ok((select tickets_enabled and not tables_enabled from public.get_public_event_by_slug('tech-mendoza-2026')), 'public projection exposes only buyer-required module flags');
select is((select count(*) from public.get_public_ticket_types('55000000-0000-4000-8000-000000000001')), 1::bigint, 'enabled tickets remain public');
select is((select count(*) from public.get_public_event_tables('55000000-0000-4000-8000-000000000001')), 0::bigint, 'disabled tables are not public');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.update_event_configuration('55000000-0000-4000-8000-000000000001', 'private_event', true, false, true, true, false, false)$$,
  'owner can change profile and explicit capabilities'
);
select is((select profile::text from public.events where id = '55000000-0000-4000-8000-000000000001'), 'private_event', 'profile metadata changes');
select ok((select tables_enabled and not promoters_enabled from public.events where id = '55000000-0000-4000-8000-000000000001'), 'profile change does not apply a destructive preset');
select is((select count(*) from public.audit_logs where entity_id = '55000000-0000-4000-8000-000000000001' and action = 'event.profile.updated'), 1::bigint, 'profile change is audited');
select is((select count(*) from public.audit_logs where entity_id = '55000000-0000-4000-8000-000000000001' and action = 'event.capability.enabled'), 1::bigint, 'capability change is audited');

select lives_ok(
  $$select public.duplicate_event_with_options('55000000-0000-4000-8000-000000000001', 'Tech Mendoza copia', 'tech-mendoza-copy-test', now() + interval '60 days', true, false, false)$$,
  'event duplication accepts capability-aware options'
);
select is((select profile::text from public.events where slug = 'tech-mendoza-copy-test'), 'private_event', 'duplicate retains profile');
select ok((select tickets_enabled and tables_enabled and access_enabled and not promoters_enabled from public.events where slug = 'tech-mendoza-copy-test'), 'duplicate retains explicit capabilities');
select is((select count(*) from public.ticket_types t join public.events e on e.id = t.event_id where e.slug = 'tech-mendoza-copy-test'), 1::bigint, 'duplicate retains ticket configuration when requested');

select lives_ok(
  $$select public.update_event_configuration('44444444-4444-4444-8444-444444444444', 'nightlife', true, false, false, true, false, false)$$,
  'owner can disable modules without deleting history'
);
select ok(
  (select count(*) > 0 from public.event_promoters where event_id = '44444444-4444-4444-8444-444444444444')
  and (select count(*) > 0 from public.event_tables where event_id = '44444444-4444-4444-8444-444444444444')
  and (select count(*) > 0 from public.orders where event_id = '44444444-4444-4444-8444-444444444444'),
  'disabling modules preserves promoters, tables and orders'
);
select is((select count(*) from public.get_public_event_tables('44444444-4444-4444-8444-444444444444')), 0::bigint, 'disabled historical tables disappear from public sales');
select throws_ok(
  $$select public.create_table_zone('44444444-4444-4444-8444-444444444444', 'Blocked', '')$$,
  'P0001', 'EVENT_CAPABILITY_DISABLED', 'disabled tables reject new configuration'
);

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok(
  $$select public.update_event_configuration('44444444-4444-4444-8444-444444444444', 'expo', true, true, true, true, false, false)$$,
  'P0001', 'NOT_ALLOWED', 'another tenant cannot mutate capabilities'
);

select * from finish();
rollback;
