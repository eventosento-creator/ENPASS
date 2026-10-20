begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Fixture: expira reservas viejas, cargo de servicio 10% y una entrada de $10.000 (1.000.000 centavos).
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.ticket_types set quantity = 5000 where event_id = '44444444-4444-4444-8444-444444444444';
update public.events set capacity = 5000 where id = '44444444-4444-4444-8444-444444444444';
update public.ticket_types set sale_phase_id = null, sort_order = 0 where event_id = '44444444-4444-4444-8444-444444444444';
update public.organizations set service_fee_bps = 1000 where id = '22222222-2222-4222-8222-222222222222';
insert into public.payment_accounts (id, organization_id, provider, provider_account_id, access_token_encrypted, refresh_token_encrypted, live_mode, status, connected_at)
values ('aaaaaaaa-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222', 'mercado_pago', 'tr-test-seller', 'enc', 'enc', false, 'connected', now());
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-000000000001', 'enpass-admin@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-000000000002', 'random-user@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into public.platform_admins (user_id) values ('bb000000-0000-4000-8000-000000000001');

create schema tr_test;
grant usage on schema tr_test to authenticated, anon;
create function tr_test.buy(p_email text) returns text language sql as $$
  select order_public_id from public.create_guest_checkout_attributed('44444444-4444-4444-8444-444444444444', 'Test', 'Buyer', p_email, '', '',
    '[{"item_type":"ticket","item_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb, null,
    '7f7b3450-f64d-491c-827e-bfa66f8b7dab'::uuid, 'b599a49f-cf73-4205-ae42-96263422bf27'::uuid);
$$;
create function tr_test.ord(p_public text) returns public.orders language sql as $$ select * from public.orders where public_id = p_public; $$;
create function tr_test.pay(p_public text) returns public.payments language sql as $$
  select p.* from public.payments p join public.orders o on o.id = p.order_id where o.public_id = p_public and p.provider = 'manual' order by p.attempt_number desc limit 1; $$;
grant execute on all functions in schema tr_test to authenticated, anon;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to anon, authenticated;
grant select on public.orders, public.payments to authenticated;

-- 1) Sin habilitar: no se puede pagar por transferencia.
select set_config('tr.a', tr_test.buy('transfer-a@example.invalid'), true);
update public.platform_settings set transfer_alias = 'enpass.cobros', transfer_cbu = '0070310730004033310755', transfer_holder = 'ENPASS', transfer_cuit = '20123456780', transfer_bank = 'Galicia' where id;
select throws_ok($$select * from public.start_transfer_payment(current_setting('tr.a'))$$, 'P0001', 'TRANSFER_NOT_AVAILABLE', 'el productor sin habilitar no ofrece transferencia');
select is((select available from public.get_transfer_instructions(current_setting('tr.a'))), false, 'las instrucciones indican que no está disponible');

-- 2) Habilitado por ENPASS (solo admin de plataforma).
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.set_ticket_transfer_enabled('22222222-2222-4222-8222-222222222222', true)$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no habilita transferencias');
select throws_ok($$select * from public.list_transfer_payments('processing')$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no ve la bandeja');
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$select public.set_ticket_transfer_enabled('22222222-2222-4222-8222-222222222222', true)$$, 'ENPASS habilita transferencias para el productor');
reset role;

-- 3) Empieza la transferencia: pago manual pendiente, reserva estirada a 30 min.
update public.orders set expires_at = now() + interval '5 minutes' where public_id = current_setting('tr.a');
update public.ticket_holds set expires_at = now() + interval '5 minutes' where order_id = (select id from public.orders where public_id = current_setting('tr.a'));
select lives_ok($$select * from public.start_transfer_payment(current_setting('tr.a'))$$, 'se inicia el pago por transferencia');
select is((tr_test.pay(current_setting('tr.a'))).status::text, 'pending', 'el pago queda pendiente');
select is((tr_test.pay(current_setting('tr.a'))).method::text, 'bank_transfer', 'el medio es transferencia');
select is((tr_test.pay(current_setting('tr.a'))).gross_amount, (tr_test.ord(current_setting('tr.a'))).total_amount, 'el monto es el total de la orden (precio + cargo)');
select is((tr_test.ord(current_setting('tr.a'))).service_fee_amount, 100000::bigint, 'el cargo de servicio es 10% sobre el precio, igual que en Mercado Pago');
select ok((tr_test.ord(current_setting('tr.a'))).expires_at > now() + interval '25 minutes', 'la reserva se estira a 30 minutos');
select is((select count(*)::int from public.start_transfer_payment(current_setting('tr.a'))), 1, 'volver a elegir transferencia reutiliza el intento');
select is((select count(*)::int from public.payments p join public.orders o on o.id = p.order_id where o.public_id = current_setting('tr.a') and p.provider = 'manual'), 1, 'no se duplica el pago');
select is((select available from public.get_transfer_instructions(current_setting('tr.a'))), true, 'las instrucciones quedan disponibles');
select is((select transfer_alias from public.get_transfer_instructions(current_setting('tr.a'))), 'enpass.cobros', 'se muestra el alias de ENPASS');

-- 4) Cambiar a Mercado Pago cancela el intento de transferencia sin comprobante.
select lives_ok($$select * from public.prepare_payment_attempt(current_setting('tr.a'))$$, 'se puede pasar a Mercado Pago antes de subir comprobante');
select is((tr_test.pay(current_setting('tr.a'))).status::text, 'cancelled', 'el intento de transferencia queda cancelado');
select is((select count(*)::int from public.payments p join public.orders o on o.id = p.order_id where o.public_id = current_setting('tr.a') and p.provider = 'mercado_pago' and p.status = 'pending'), 1, 'se crea el intento de Mercado Pago');

-- 5) Vuelve a transferencia y sube el comprobante.
select lives_ok($$select * from public.start_transfer_payment(current_setting('tr.a'))$$, 'vuelve a elegir transferencia');
select throws_ok($$select public.submit_transfer_proof(current_setting('tr.a'), 'x')$$, 'P0001', 'INVALID_PROOF', 'un comprobante inválido se rechaza');
select lives_ok($$select public.submit_transfer_proof(current_setting('tr.a'), 'orders/abc/proof.jpg')$$, 'se sube el comprobante');
select is((tr_test.pay(current_setting('tr.a'))).status::text, 'processing', 'el pago queda en revisión');
select ok((tr_test.ord(current_setting('tr.a'))).expires_at > now() + interval '23 hours', 'la reserva se mantiene hasta 24 hs para la revisión');
select throws_ok($$select * from public.prepare_payment_attempt(current_setting('tr.a'))$$, 'P0001', 'TRANSFER_IN_REVIEW', 'en revisión no se puede pagar con otro medio');
select is((tr_test.ord(current_setting('tr.a'))).status::text, 'pending', 'la orden sigue pendiente hasta aprobar');
select is((select count(*)::int from public.tickets t join public.orders o on o.id = t.order_id where o.public_id = current_setting('tr.a')), 0, 'no se emiten entradas antes de aprobar');

-- 6) Revisión: solo ENPASS. Rechazo deja reintentar; aprobación emite y registra la venta.
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.review_transfer_payment((tr_test.pay(current_setting('tr.a'))).public_id, true, null)$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no aprueba');
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.list_transfer_payments('processing') where order_public_id = current_setting('tr.a')), 1, 'la bandeja muestra la transferencia en revisión');
select is(public.review_transfer_payment((tr_test.pay(current_setting('tr.a'))).public_id, true, null), 'approved', 'ENPASS aprueba la transferencia');
reset role;
select is((tr_test.ord(current_setting('tr.a'))).status::text, 'paid', 'la orden pasa a pagada');
select is((select sum(amount)::bigint from public.ledger_movements where order_id = (tr_test.ord(current_setting('tr.a'))).id and movement_type = 'ticket_sale'), 1000000::bigint, 'se registra la venta del productor (sin el cargo de ENPASS)');
select is((select sum(amount)::bigint from public.ledger_movements where order_id = (tr_test.ord(current_setting('tr.a'))).id and movement_type = 'payment_received'), 1100000::bigint, 'queda registrado lo que recibió ENPASS (precio + cargo)');
select throws_ok($$select public.review_transfer_payment((tr_test.pay(current_setting('tr.a'))).public_id, true, null)$$, 'P0001', 'PAYMENT_NOT_IN_REVIEW', 'aprobar dos veces no vuelve a registrar nada');

-- 7) Rechazo: el comprador puede reintentar mientras dure la reserva.
select set_config('tr.b', tr_test.buy('transfer-b@example.invalid'), true);
select public.start_transfer_payment(current_setting('tr.b'));
select public.submit_transfer_proof(current_setting('tr.b'), 'orders/def/proof.jpg');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.review_transfer_payment((tr_test.pay(current_setting('tr.b'))).public_id, false, 'El monto no coincide'), 'rejected', 'ENPASS rechaza la transferencia');
reset role;
select is((tr_test.pay(current_setting('tr.b'))).status::text, 'rejected', 'el pago queda rechazado con su motivo');
select ok((tr_test.ord(current_setting('tr.b'))).expires_at <= now() + interval '31 minutes', 'tras el rechazo la reserva vuelve a 30 minutos');
select lives_ok($$select * from public.start_transfer_payment(current_setting('tr.b'))$$, 'el comprador puede iniciar un nuevo intento');
select is((tr_test.pay(current_setting('tr.b'))).attempt_number, 2, 'el nuevo intento conserva el historial del rechazado');

select * from finish();
rollback;
