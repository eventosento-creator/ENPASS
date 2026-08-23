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
