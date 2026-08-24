-- Development owner: owner@nightlife.local / Nightlife123!
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'owner@nightlife.local',
  crypt('Nightlife123!', gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
values (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@nightlife.local"}',
  'email', now(), now()
) on conflict (provider_id, provider) do nothing;

insert into public.organizations (id, name, slug, service_fee_bps, platform_fee_bps)
values ('22222222-2222-4222-8222-222222222222', 'Club Demo', 'club-demo', 800, 800)
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'owner')
on conflict do nothing;

insert into public.venues (id, organization_id, name, address, city, province, capacity, timezone)
values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Club Central', 'Av. España 2110', 'Mendoza', 'Mendoza', 600, 'America/Argentina/Mendoza')
on conflict (id) do nothing;

insert into public.events (id, organization_id, venue_id, name, slug, description, cover_image_url, starts_at, doors_open_at, status, capacity, currency, published_at, created_by)
values ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Noche 2000', 'noche-2000', 'Una noche de clásicos, hits y visuales inmersivas en el corazón de Mendoza. Puertas 23:30.', '/demo/noche-2000.png', timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '14 days 23 hours 59 minutes'), timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '14 days 22 hours 59 minutes'), 'published', 600, 'ARS', now(), '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.events (id, organization_id, venue_id, name, slug, description, cover_image_url, starts_at, status, capacity, currency, published_at, created_by)
values
  ('77777777-7777-4777-8777-777777777771', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Club Session', 'club-session', 'Una sesión de viernes con sonido envolvente, luces precisas y pista hasta tarde.', '/demo/club-session.png', timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '1 day 23 hours 30 minutes'), 'published', 500, 'ARS', now(), '11111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777772', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Después de las 12', 'despues-de-las-12', 'La noche cambia cuando pasa medianoche. Selección musical, visuales y pista abierta.', '/demo/despues-de-las-12.png', timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '2 days 30 minutes'), 'published', 450, 'ARS', now(), '11111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777773', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Sunset Club', 'sunset-club', 'Atardecer, terraza y una noche que empieza antes. Apertura 20:00.', '/demo/sunset-club.png', timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '3 days 20 hours'), 'published', 350, 'ARS', now(), '11111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777774', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Fecha Electrónica', 'fecha-electronica', 'Graves profundos, arquitectura lumínica y una fecha dedicada al pulso electrónico.', '/demo/fecha-electronica.png', timezone('America/Argentina/Mendoza', date_trunc('day', now() at time zone 'America/Argentina/Mendoza') + interval '9 days 23 hours 45 minutes'), 'published', 600, 'ARS', now(), '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.sale_phases (id, organization_id, event_id, name, sort_order)
values
  ('88888888-8888-4888-8888-888888888811', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771', 'Preventa', 0),
  ('88888888-8888-4888-8888-888888888812', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771', 'General', 1),
  ('88888888-8888-4888-8888-888888888821', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777772', 'Anticipada', 0),
  ('88888888-8888-4888-8888-888888888822', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777772', 'General', 1),
  ('88888888-8888-4888-8888-888888888831', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777773', 'General', 0),
  ('88888888-8888-4888-8888-888888888841', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777774', 'Preventa', 0),
  ('88888888-8888-4888-8888-888888888842', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777774', 'General', 1)
on conflict (id) do nothing;

insert into public.ticket_types (id, organization_id, event_id, sale_phase_id, name, price_amount, quantity, max_per_order, sort_order)
values
  ('99999999-9999-4999-8999-999999999911', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771', '88888888-8888-4888-8888-888888888811', 'Preventa', 1200000, 80, 6, 0),
  ('99999999-9999-4999-8999-999999999912', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771', '88888888-8888-4888-8888-888888888812', 'General', 1500000, 220, 6, 1),
  ('99999999-9999-4999-8999-999999999921', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777772', '88888888-8888-4888-8888-888888888821', 'Anticipada', 1400000, 100, 6, 0),
  ('99999999-9999-4999-8999-999999999922', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777772', '88888888-8888-4888-8888-888888888822', 'General', 1800000, 250, 6, 1),
  ('99999999-9999-4999-8999-999999999931', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777773', '88888888-8888-4888-8888-888888888831', 'General', 900000, 280, 6, 0),
  ('99999999-9999-4999-8999-999999999941', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777774', '88888888-8888-4888-8888-888888888841', 'Preventa', 1800000, 120, 6, 0),
  ('99999999-9999-4999-8999-999999999942', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777774', '88888888-8888-4888-8888-888888888842', 'General', 2200000, 320, 6, 1)
on conflict (id) do nothing;

insert into public.sale_phases (id, organization_id, event_id, name, sort_order)
values
  ('66666666-6666-4666-8666-666666666661', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Preventa 1', 0),
  ('66666666-6666-4666-8666-666666666662', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Preventa 2', 1),
  ('66666666-6666-4666-8666-666666666663', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'General', 2)
on conflict (id) do nothing;

insert into public.ticket_types (id, organization_id, event_id, sale_phase_id, name, price_amount, quantity, max_per_order, sort_order)
values
  ('55555555-5555-4555-8555-555555555551', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666661', 'Preventa 1', 1000000, 100, 6, 0),
  ('55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666662', 'Preventa 2', 1300000, 200, 6, 1),
  ('55555555-5555-4555-8555-555555555553', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '66666666-6666-4666-8666-666666666663', 'General', 1600000, 300, 6, 2)
on conflict (id) do nothing;

insert into public.events (id, organization_id, venue_id, name, slug, description, starts_at, status, capacity, currency, created_by)
values ('44444444-4444-4444-8444-444444444445', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Fecha en preparación', 'fecha-en-preparacion', 'Borrador para probar estados de gestión.', now() + interval '21 days', 'draft', 400, 'ARS', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- Controlled local fixture for FASE 2B. Opening /order/2b2b... lazily emits exactly
-- three Tickets and sends their secure access link to Mailpit. It never exists in cloud.
insert into public.customers (id, organization_id, first_name, last_name, email, phone)
values (
  '2b000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'Elias',
  'González',
  'buyer@nightlife.local',
  '+5492615550101'
) on conflict (id) do nothing;

insert into public.orders (
  id, public_id, organization_id, event_id, customer_id, channel, status,
  subtotal_amount, service_fee_amount, total_amount, currency, expires_at
) values (
  '2b000000-0000-4000-8000-000000000002',
  '2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  '2b000000-0000-4000-8000-000000000001',
  'ticket_web',
  'paid',
  4200000,
  336000,
  4536000,
  'ARS',
  now() + interval '10 minutes'
) on conflict (id) do nothing;

insert into public.order_items (
  id, organization_id, order_id, ticket_type_id, item_name,
  quantity, unit_price_amount, line_total_amount, currency
) values
  (
    '2b000000-0000-4000-8000-000000000011',
    '22222222-2222-4222-8222-222222222222',
    '2b000000-0000-4000-8000-000000000002',
    '55555555-5555-4555-8555-555555555552',
    'Preventa 2', 2, 1300000, 2600000, 'ARS'
  ),
  (
    '2b000000-0000-4000-8000-000000000012',
    '22222222-2222-4222-8222-222222222222',
    '2b000000-0000-4000-8000-000000000002',
    '55555555-5555-4555-8555-555555555553',
    'General', 1, 1600000, 1600000, 'ARS'
  )
on conflict (id) do nothing;

insert into public.ticket_holds (
  id, organization_id, event_id, ticket_type_id, order_id, quantity, status, expires_at
) values
  (
    '2b000000-0000-4000-8000-000000000021',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555552',
    '2b000000-0000-4000-8000-000000000002', 2, 'consumed', now() + interval '10 minutes'
  ),
  (
    '2b000000-0000-4000-8000-000000000022',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555553',
    '2b000000-0000-4000-8000-000000000002', 1, 'consumed', now() + interval '10 minutes'
  )
on conflict (id) do nothing;

-- FASE 3 local access fixtures. These deterministic credentials are intentionally
-- development-only and are exposed exclusively by /dev/qr outside production.
insert into public.access_gates (id, organization_id, event_id, name, description, active)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'Acceso principal', 'Ingreso general por Av. España', true
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'Acceso VIP', 'Ingreso preferencial', true
  )
on conflict (id) do nothing;

insert into public.access_gate_ticket_types (access_gate_id, ticket_type_id, organization_id, event_id)
values
  ('a3000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555551', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444'),
  ('a3000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555553', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444'),
  ('a3000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444')
on conflict do nothing;

-- Local PINs: scanner 320000, supervisor 320001. A reset renews their 60-minute window.
insert into public.scanner_device_authorizations (
  id, organization_id, event_id, access_gate_id, label, permission, pin_hash,
  code_expires_at, session_expires_at, created_by
) values
  (
    'a3000000-0000-4000-8000-000000000011',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'a3000000-0000-4000-8000-000000000001',
    'Scanner puerta 1', 'scanner', extensions.crypt('320000', extensions.gen_salt('bf', 10)),
    now() + interval '1 hour',
    (select starts_at + interval '16 hours' from public.events where id = '44444444-4444-4444-8444-444444444444'),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'a3000000-0000-4000-8000-000000000012',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'a3000000-0000-4000-8000-000000000001',
    'Supervisor puerta 1', 'supervisor', extensions.crypt('320001', extensions.gen_salt('bf', 10)),
    now() + interval '1 hour',
    (select starts_at + interval '16 hours' from public.events where id = '44444444-4444-4444-8444-444444444444'),
    '11111111-1111-4111-8111-111111111111'
  )
on conflict (id) do nothing;

insert into public.customers (id, organization_id, first_name, last_name, email)
values
  ('a3000000-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222', 'Acceso', 'Demo', 'access-fixtures@nightlife.local'),
  ('a3000000-0000-4000-8000-000000000022', '22222222-2222-4222-8222-222222222222', 'Reembolso', 'Demo', 'access-refunded@nightlife.local'),
  ('a3000000-0000-4000-8000-000000000023', '22222222-2222-4222-8222-222222222222', 'Otro', 'Evento', 'access-other-event@nightlife.local')
on conflict (id) do nothing;

insert into public.orders (
  id, public_id, organization_id, event_id, customer_id, status,
  subtotal_amount, service_fee_amount, total_amount, currency, expires_at
) values
  (
    'a3000000-0000-4000-8000-000000000031', 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a301',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'a3000000-0000-4000-8000-000000000021', 'paid', 9300000, 0, 9300000, 'ARS', now() + interval '30 days'
  ),
  (
    'a3000000-0000-4000-8000-000000000032', 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a302',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'a3000000-0000-4000-8000-000000000022', 'refunded', 1600000, 0, 1600000, 'ARS', now() + interval '30 days'
  ),
  (
    'a3000000-0000-4000-8000-000000000033', 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a303',
    '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771',
    'a3000000-0000-4000-8000-000000000023', 'paid', 1200000, 0, 1200000, 'ARS', now() + interval '30 days'
  ),
  (
    'a3000000-0000-4000-8000-000000000034', 'a3a3a3a3a3a3a3a3a3a3a3a3a3a3a304',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'a3000000-0000-4000-8000-000000000021', 'cancelled', 1600000, 0, 1600000, 'ARS', now() + interval '30 days'
  )
on conflict (id) do nothing;

insert into public.order_items (
  id, organization_id, order_id, ticket_type_id, item_name,
  quantity, unit_price_amount, line_total_amount, currency
) values
  ('a3000000-0000-4000-8000-000000000041', '22222222-2222-4222-8222-222222222222', 'a3000000-0000-4000-8000-000000000031', '55555555-5555-4555-8555-555555555553', 'General', 5, 1600000, 8000000, 'ARS'),
  ('a3000000-0000-4000-8000-000000000042', '22222222-2222-4222-8222-222222222222', 'a3000000-0000-4000-8000-000000000031', '55555555-5555-4555-8555-555555555552', 'Preventa 2 VIP', 1, 1300000, 1300000, 'ARS'),
  ('a3000000-0000-4000-8000-000000000043', '22222222-2222-4222-8222-222222222222', 'a3000000-0000-4000-8000-000000000032', '55555555-5555-4555-8555-555555555553', 'General', 1, 1600000, 1600000, 'ARS'),
  ('a3000000-0000-4000-8000-000000000044', '22222222-2222-4222-8222-222222222222', 'a3000000-0000-4000-8000-000000000033', '99999999-9999-4999-8999-999999999911', 'Preventa', 1, 1200000, 1200000, 'ARS'),
  ('a3000000-0000-4000-8000-000000000045', '22222222-2222-4222-8222-222222222222', 'a3000000-0000-4000-8000-000000000034', '55555555-5555-4555-8555-555555555553', 'General', 1, 1600000, 1600000, 'ARS')
on conflict (id) do nothing;

insert into public.tickets (
  id, organization_id, event_id, order_id, order_item_id, ticket_type_id, customer_id,
  unit_index, status, holder_first_name, holder_last_name, max_entries, used_entries,
  valid_from, valid_until, sector, short_code, qr_token_hash, qr_token_encrypted, refunded_at
) values
  ('a3000000-0000-4000-8000-000000000051', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000021', 1, 'valid', 'Valentina', 'Demo', 1, 0, now() - interval '1 day', now() + interval '30 days', 'Pista', 'NVAL-D1', encode(extensions.digest(convert_to('NLOS1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8'), 'sha256'), 'hex'), repeat('v', 40), null),
  ('a3000000-0000-4000-8000-000000000052', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000021', 2, 'valid', 'Ulises', 'Demo', 1, 1, now() - interval '1 day', now() + interval '30 days', 'Pista', 'NUSE-D1', encode(extensions.digest(convert_to('NLOS1:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'UTF8'), 'sha256'), 'hex'), repeat('u', 40), null),
  ('a3000000-0000-4000-8000-000000000053', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000021', 3, 'valid', 'Temprano', 'Demo', 1, 0, now() + interval '1 day', now() + interval '30 days', 'Pista', 'NEAR-D1', encode(extensions.digest(convert_to('NLOS1:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'UTF8'), 'sha256'), 'hex'), repeat('e', 40), null),
  ('a3000000-0000-4000-8000-000000000054', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000021', 4, 'valid', 'Tarde', 'Demo', 1, 0, now() - interval '30 days', now() - interval '1 day', 'Pista', 'NLAT-D1', encode(extensions.digest(convert_to('NLOS1:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 'UTF8'), 'sha256'), 'hex'), repeat('l', 40), null),
  ('a3000000-0000-4000-8000-000000000055', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000021', 5, 'valid', 'Múltiple', 'Demo', 2, 0, now() - interval '1 day', now() + interval '30 days', 'Pista', 'NMUL-D1', encode(extensions.digest(convert_to('NLOS1:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'UTF8'), 'sha256'), 'hex'), repeat('m', 40), null),
  ('a3000000-0000-4000-8000-000000000056', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000042', '55555555-5555-4555-8555-555555555552', 'a3000000-0000-4000-8000-000000000021', 1, 'valid', 'Victoria', 'VIP', 1, 0, now() - interval '1 day', now() + interval '30 days', 'VIP', 'NVIP-D1', encode(extensions.digest(convert_to('NLOS1:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'UTF8'), 'sha256'), 'hex'), repeat('p', 40), null),
  ('a3000000-0000-4000-8000-000000000057', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'a3000000-0000-4000-8000-000000000032', 'a3000000-0000-4000-8000-000000000043', '55555555-5555-4555-8555-555555555553', 'a3000000-0000-4000-8000-000000000022', 1, 'refunded', 'Renata', 'Reembolso', 1, 0, now() - interval '1 day', now() + interval '30 days', 'Pista', 'NREF-D1', encode(extensions.digest(convert_to('NLOS1:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', 'UTF8'), 'sha256'), 'hex'), repeat('r', 40), now()),
  ('a3000000-0000-4000-8000-000000000058', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771', 'a3000000-0000-4000-8000-000000000033', 'a3000000-0000-4000-8000-000000000044', '99999999-9999-4999-8999-999999999911', 'a3000000-0000-4000-8000-000000000023', 1, 'valid', 'Olivia', 'Otro', 1, 0, now() - interval '1 day', now() + interval '30 days', 'General', 'NOTR-D1', encode(extensions.digest(convert_to('NLOS1:HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', 'UTF8'), 'sha256'), 'hex'), repeat('o', 40), null)
on conflict (id) do nothing;

insert into public.tickets (
  id, organization_id, event_id, order_id, order_item_id, ticket_type_id, customer_id,
  unit_index, status, holder_first_name, holder_last_name, max_entries, used_entries,
  valid_from, valid_until, sector, short_code, qr_token_hash, qr_token_encrypted, cancelled_at
) values (
  'a3000000-0000-4000-8000-000000000059',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  'a3000000-0000-4000-8000-000000000034',
  'a3000000-0000-4000-8000-000000000045',
  '55555555-5555-4555-8555-555555555553',
  'a3000000-0000-4000-8000-000000000021',
  1, 'cancelled', 'Camila', 'Cancelada', 1, 0,
  now() - interval '1 day', now() + interval '30 days', 'Pista', 'NCAN-D1',
  encode(extensions.digest(convert_to('NLOS1:IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII', 'UTF8'), 'sha256'), 'hex'),
  repeat('c', 40), now()
) on conflict (id) do nothing;

insert into public.checkins (
  id, organization_id, event_id, ticket_id, access_gate_id, result,
  source, entry_number, idempotency_key, scanned_at
) values (
  'a3000000-0000-4000-8000-000000000061',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  'a3000000-0000-4000-8000-000000000052',
  'a3000000-0000-4000-8000-000000000001',
  'valid', 'qr', 1,
  'a3000000-0000-4000-8000-000000000062',
  now() - interval '1 hour'
) on conflict (id) do nothing;

-- FASE 4 local RRPP fixtures. The invitation token is intentionally local,
-- one-time and restored by `supabase db reset`.
insert into public.promoters (
  id, organization_id, display_name, first_name, last_name, email, phone, instagram, status
) values
  (
    'f4000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'Lucas Gómez', 'Lucas', 'Gómez', 'lucas@nightlife.local', '+5492615550201', 'lucasg', 'active'
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'Martina Ruiz', 'Martina', 'Ruiz', 'martina@nightlife.local', '+5492615550202', 'martinar', 'active'
  ),
  (
    'f4000000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    'Agus Pérez', 'Agus', 'Pérez', null, '+5492615550203', 'agusp', 'active'
  )
on conflict (id) do nothing;

insert into public.event_promoters (
  id, organization_id, event_id, promoter_id, public_slug, status
) values
  (
    'f4000000-0000-4000-8000-000000000101',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000001', 'lucas', 'active'
  ),
  (
    'f4000000-0000-4000-8000-000000000102',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000002', 'martina', 'active'
  ),
  (
    'f4000000-0000-4000-8000-000000000103',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000003', 'agus', 'active'
  ),
  (
    'f4000000-0000-4000-8000-000000000104',
    '22222222-2222-4222-8222-222222222222',
    '77777777-7777-4777-8777-777777777771',
    'f4000000-0000-4000-8000-000000000001', 'lucas', 'active'
  )
on conflict (id) do nothing;

insert into public.promoter_commission_rules (
  id, organization_id, event_id, event_promoter_id, ticket_type_id,
  commission_type, commission_value, currency, active
) values
  (
    'f4000000-0000-4000-8000-000000000201',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000101', null, 'fixed_per_ticket', 100000, 'ARS', true
  ),
  (
    'f4000000-0000-4000-8000-000000000202',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000102', null, 'percentage', 500, 'ARS', true
  ),
  (
    'f4000000-0000-4000-8000-000000000203',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000103', null, 'percentage', 500, 'ARS', true
  ),
  (
    'f4000000-0000-4000-8000-000000000204',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000103', '55555555-5555-4555-8555-555555555552',
    'percentage', 800, 'ARS', true
  ),
  (
    'f4000000-0000-4000-8000-000000000205',
    '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777771',
    'f4000000-0000-4000-8000-000000000104', null, 'fixed_per_ticket', 120000, 'ARS', true
  )
on conflict (id) do nothing;

insert into public.promoter_access_tokens (
  id, organization_id, promoter_id, event_promoter_id, token_hash, expires_at
) values (
  'f4000000-0000-4000-8000-000000000301',
  '22222222-2222-4222-8222-222222222222',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000101',
  encode(extensions.digest(convert_to(repeat('L', 43), 'UTF8'), 'sha256'), 'hex'),
  now() + interval '24 hours'
) on conflict (id) do nothing;

insert into public.customers (id, organization_id, first_name, last_name, email)
values
  ('f4000000-0000-4000-8000-000000000401', '22222222-2222-4222-8222-222222222222', 'Buyer', 'Lucas', 'buyer-lucas@nightlife.local'),
  ('f4000000-0000-4000-8000-000000000402', '22222222-2222-4222-8222-222222222222', 'Buyer', 'Martina', 'buyer-martina@nightlife.local'),
  ('f4000000-0000-4000-8000-000000000403', '22222222-2222-4222-8222-222222222222', 'Buyer', 'Agus', 'buyer-agus@nightlife.local')
on conflict (id) do nothing;

insert into public.orders (
  id, public_id, organization_id, event_id, customer_id, status,
  subtotal_amount, service_fee_amount, total_amount, currency, expires_at,
  promoter_id, event_promoter_id
) values
  (
    'f4000000-0000-4000-8000-000000000501', 'f4f4f4f4f4f4f4f4f4f4f4f4f4f4f401',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000401', 'paid', 4800000, 384000, 5184000, 'ARS', now() + interval '10 minutes',
    'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000101'
  ),
  (
    'f4000000-0000-4000-8000-000000000502', 'f4f4f4f4f4f4f4f4f4f4f4f4f4f4f402',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000402', 'paid', 2600000, 208000, 2808000, 'ARS', now() + interval '10 minutes',
    'f4000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000102'
  ),
  (
    'f4000000-0000-4000-8000-000000000503', 'f4f4f4f4f4f4f4f4f4f4f4f4f4f4f403',
    '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
    'f4000000-0000-4000-8000-000000000403', 'paid', 2900000, 232000, 3132000, 'ARS', now() + interval '10 minutes',
    'f4000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000103'
  )
on conflict (id) do nothing;

insert into public.order_items (
  id, organization_id, order_id, ticket_type_id, item_name,
  quantity, unit_price_amount, line_total_amount, currency
) values
  ('f4000000-0000-4000-8000-000000000601', '22222222-2222-4222-8222-222222222222', 'f4000000-0000-4000-8000-000000000501', '55555555-5555-4555-8555-555555555553', 'General', 3, 1600000, 4800000, 'ARS'),
  ('f4000000-0000-4000-8000-000000000602', '22222222-2222-4222-8222-222222222222', 'f4000000-0000-4000-8000-000000000502', '55555555-5555-4555-8555-555555555552', 'Preventa 2', 2, 1300000, 2600000, 'ARS'),
  ('f4000000-0000-4000-8000-000000000603', '22222222-2222-4222-8222-222222222222', 'f4000000-0000-4000-8000-000000000503', '55555555-5555-4555-8555-555555555553', 'General', 1, 1600000, 1600000, 'ARS'),
  ('f4000000-0000-4000-8000-000000000604', '22222222-2222-4222-8222-222222222222', 'f4000000-0000-4000-8000-000000000503', '55555555-5555-4555-8555-555555555552', 'Preventa 2', 1, 1300000, 1300000, 'ARS')
on conflict (id) do nothing;

insert into public.ticket_holds (
  id, organization_id, event_id, ticket_type_id, order_id, quantity, status, expires_at
) values
  ('f4000000-0000-4000-8000-000000000701', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555553', 'f4000000-0000-4000-8000-000000000501', 3, 'consumed', now() + interval '10 minutes'),
  ('f4000000-0000-4000-8000-000000000702', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555552', 'f4000000-0000-4000-8000-000000000502', 2, 'consumed', now() + interval '10 minutes'),
  ('f4000000-0000-4000-8000-000000000703', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555553', 'f4000000-0000-4000-8000-000000000503', 1, 'consumed', now() + interval '10 minutes'),
  ('f4000000-0000-4000-8000-000000000704', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555552', 'f4000000-0000-4000-8000-000000000503', 1, 'consumed', now() + interval '10 minutes')
on conflict (id) do nothing;

insert into public.promoter_link_visits (
  organization_id, event_id, event_promoter_id, anonymous_session_id, visited_at
)
select '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'f4000000-0000-4000-8000-000000000101', gen_random_uuid(), now() - make_interval(mins => visit_number)
from generate_series(1, 8) visit_number;

insert into public.promoter_link_visits (
  organization_id, event_id, event_promoter_id, anonymous_session_id, visited_at
)
select '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'f4000000-0000-4000-8000-000000000102', gen_random_uuid(), now() - make_interval(mins => visit_number)
from generate_series(1, 6) visit_number;

insert into public.promoter_link_visits (
  organization_id, event_id, event_promoter_id, anonymous_session_id, visited_at
)
select '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'f4000000-0000-4000-8000-000000000103', gen_random_uuid(), now() - make_interval(mins => visit_number)
from generate_series(1, 3) visit_number;

select public.calculate_promoter_commissions_for_order('f4000000-0000-4000-8000-000000000501');
select public.calculate_promoter_commissions_for_order('f4000000-0000-4000-8000-000000000502');
select public.calculate_promoter_commissions_for_order('f4000000-0000-4000-8000-000000000503');
