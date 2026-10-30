begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Evento demo "Noche 2000" (Club Demo), tipo "Pista" = 55555555-...553. Dueño = 11111111...
create function pg_temp.tz() returns text language sql as $$ select v.timezone from public.events e join public.venues v on v.id = e.venue_id where e.id = '44444444-4444-4444-8444-444444444444' $$;
create function pg_temp.base_until() returns timestamptz language sql as $$ select coalesce(ends_at, starts_at + interval '12 hours') from public.events where id = '44444444-4444-4444-8444-444444444444' $$;

-- 1) El cálculo del corte: cruza la medianoche cuando hace falta y no, cuando no.
select is(public.next_local_time_after('2026-10-31 23:00-03', '02:30', 'America/Argentina/Mendoza'), '2026-11-01 02:30-03'::timestamptz, 'puertas 23:00 y corte 02:30: el corte es de madrugada, del día siguiente');
select is(public.next_local_time_after('2026-10-31 20:00-03', '21:00', 'America/Argentina/Mendoza'), '2026-10-31 21:00-03'::timestamptz, 'puertas 20:00 y corte 21:00: el corte es el mismo día');
select is(public.next_local_time_after('2026-10-31 21:00-03', '21:00', 'America/Argentina/Mendoza'), '2026-11-01 21:00-03'::timestamptz, 'si el corte coincide con la apertura, es el día siguiente (siempre posterior)');

-- 2) Poner un corte recorta las entradas ya vendidas de ese tipo.
update public.ticket_types set entry_cutoff_time = '02:30' where id = '55555555-5555-4555-8555-555555555553';
select is(
  (select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'),
  public.next_local_time_after((select valid_from from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'), '02:30', pg_temp.tz()),
  'las entradas vendidas de ese tipo vencen en el corte'
);
select is(
  (select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000056'),
  (select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000056'),
  'preparación: la entrada de otro tipo existe'
);
select ok(
  (select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000056') > now() + interval '20 days',
  'las entradas de otro tipo sin corte no se tocan'
);

-- 3) Una entrada nueva de ese tipo nace con el corte aplicado.
insert into public.tickets (
  id, organization_id, event_id, order_id, order_item_id, ticket_type_id, customer_id,
  unit_index, status, holder_first_name, holder_last_name, max_entries, used_entries,
  valid_from, valid_until, sector, short_code, qr_token_hash, qr_token_encrypted
) values (
  'a3000000-0000-4000-8000-0000000000c1', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444',
  'a3000000-0000-4000-8000-000000000031', 'a3000000-0000-4000-8000-000000000041', '55555555-5555-4555-8555-555555555553',
  'a3000000-0000-4000-8000-000000000021', 9, 'valid', 'Corte', 'Nueva', 1, 0,
  '2026-10-31 23:00-03', '2026-11-05 12:00-03', 'Pista', 'NCUT-D1',
  encode(extensions.digest(convert_to('cutoff-test', 'UTF8'), 'sha256'), 'hex'), 'dev:NLOS1:CUTOFFCUTOFFCUTOFFCUTOFFCUTOFFCUTOFFCUTOFF'
);
select is((select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-0000000000c1'), '2026-11-01 02:30-03'::timestamptz, 'una entrada nueva sale con el corte aplicado');

-- 4) Si el productor edita el horario del evento, el corte se mantiene.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.update_event_details(
  '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
  'Noche 2000', '', now() + interval '15 days', now() + interval '15 days' - interval '1 hour', now() + interval '15 days' + interval '16 hours', 650, false
);
reset role;
select is(
  (select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'),
  public.next_local_time_after((select valid_from from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'), '02:30', pg_temp.tz()),
  'al cambiar el horario del evento, el corte se vuelve a aplicar'
);

-- 5) Quitar el corte devuelve la validez base del evento.
update public.ticket_types set entry_cutoff_time = null where id = '55555555-5555-4555-8555-555555555553';
select is((select valid_until from public.tickets where id = 'a3000000-0000-4000-8000-000000000051'), pg_temp.base_until(), 'sin corte, la entrada vuelve a valer hasta el fin del evento');

select * from finish();
rollback;
