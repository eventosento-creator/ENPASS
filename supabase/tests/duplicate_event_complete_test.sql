begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Evento "Noche 2000" (dueño 1111…), tipo "Pista" = 55555555-…553. Se le agrega hora límite, taquilla y una entrada solo con link.
update public.ticket_types set entry_cutoff_time = '02:30' where id = '55555555-5555-4555-8555-555555555553';
update public.events set discovery_category = 'concert' where id = '44444444-4444-4444-8444-444444444444';
insert into public.ticket_types (organization_id, event_id, name, price_amount, currency, quantity, link_only, link_token, sort_order)
values ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Solo con link', 0, 'ARS', 5, true, 'tokenorigen', 99);
insert into public.event_box_office_settings (event_id, organization_id, enabled, cash_enabled, transfer_enabled, closes_at)
values ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', true, true, true,
  (select starts_at + interval '3 hours' from public.events where id = '44444444-4444-4444-8444-444444444444'))
on conflict (event_id) do update set enabled = true, transfer_enabled = true, closes_at = excluded.closes_at;
insert into public.ticket_type_channel_prices (ticket_type_id, channel, organization_id, event_id, price_amount)
values ('55555555-5555-4555-8555-555555555553', 'box_office', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 12345)
on conflict (ticket_type_id, channel) do update set price_amount = 12345;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$select public.duplicate_event_with_options('44444444-4444-4444-8444-444444444444', 'Noche 2000 copia', 'noche-2000-copia-test', now() + interval '60 days', true, false, false, false, false)$$,
  'duplicar con entradas funciona'
);
reset role;

select is((select discovery_category::text from public.events where slug = 'noche-2000-copia-test'), 'concert', 'la copia conserva la categoría del evento');
select is((select tt.entry_cutoff_time::text from public.ticket_types tt join public.events e on e.id = tt.event_id where e.slug = 'noche-2000-copia-test' and tt.name = (select name from public.ticket_types where id = '55555555-5555-4555-8555-555555555553')), '02:30:00', 'la copia conserva la hora límite de ingreso');
select ok((select tt.link_only and tt.link_token is not null and tt.link_token <> 'tokenorigen' from public.ticket_types tt join public.events e on e.id = tt.event_id where e.slug = 'noche-2000-copia-test' and tt.name = 'Solo con link'), 'la entrada solo con link se copia con un link nuevo');
select is((select link_token from public.ticket_types where event_id = '44444444-4444-4444-8444-444444444444' and name = 'Solo con link'), 'tokenorigen', 'el link del evento original no cambia');
select ok((select s.enabled and s.transfer_enabled from public.event_box_office_settings s join public.events e on e.id = s.event_id where e.slug = 'noche-2000-copia-test'), 'la copia conserva la configuración de taquilla');
select is((select s.closes_at - e.starts_at from public.event_box_office_settings s join public.events e on e.id = s.event_id where e.slug = 'noche-2000-copia-test'), interval '3 hours', 'el cierre de taquilla se corre junto con la fecha');
select is((select p.price_amount from public.ticket_type_channel_prices p join public.ticket_types tt on tt.id = p.ticket_type_id join public.events e on e.id = tt.event_id where e.slug = 'noche-2000-copia-test' and p.channel = 'box_office'), 12345::bigint, 'la copia conserva el precio de taquilla');
select is((select count(*) from public.access_gates g join public.events e on e.id = g.event_id where e.slug = 'noche-2000-copia-test'), 1::bigint, 'la copia nace con su puerta automática y sin scanners copiados');

select * from finish();
rollback;
