begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Fixture igual al de transfer_payments_test: reservas viejas vencidas, cargo 10%, transferencia habilitada y 2 ventas aprobadas.
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.ticket_types set quantity = 5000 where event_id = '44444444-4444-4444-8444-444444444444';
update public.events set capacity = 5000 where id = '44444444-4444-4444-8444-444444444444';
update public.ticket_types set sale_phase_id = null, sort_order = 0 where event_id = '44444444-4444-4444-8444-444444444444';
update public.organizations set service_fee_bps = 1000, ticket_transfer_enabled = true where id = '22222222-2222-4222-8222-222222222222';
update public.platform_settings set transfer_alias = 'enpass.cobros', transfer_cbu = '0070310730004033310755' where id;
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-000000000011', 'enpass-admin2@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-000000000012', 'random-user2@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into public.platform_admins (user_id) values ('bb000000-0000-4000-8000-000000000011');

create schema tp_test;
grant usage on schema tp_test to authenticated;
create function tp_test.sale(p_email text) returns text language plpgsql as $$
declare o text; begin
  select order_public_id into o from public.create_guest_checkout_attributed('44444444-4444-4444-8444-444444444444', 'Test', 'Buyer', p_email, '', '',
    '[{"item_type":"ticket","item_id":"55555555-5555-4555-8555-555555555551","quantity":1}]'::jsonb, null,
    '7f7b3450-f64d-491c-827e-bfa66f8b7dab'::uuid, 'b599a49f-cf73-4205-ae42-96263422bf27'::uuid);
  perform public.start_transfer_payment(o);
  perform public.submit_transfer_proof(o, 'orders/' || o || '/proof.png');
  return o;
end $$;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to authenticated;

select set_config('tp.a', tp_test.sale('payout-a@example.invalid'), true);
select set_config('tp.b', tp_test.sale('payout-b@example.invalid'), true);
create function tp_test.pid(o text) returns text language sql as $$
  select p.public_id from public.payments p join public.orders ord on ord.id = p.order_id where ord.public_id = o and p.method = 'bank_transfer' order by p.attempt_number desc limit 1 $$;
grant execute on function tp_test.pid(text) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000011","role":"authenticated"}';
select is(public.review_transfer_payment(tp_test.pid(current_setting('tp.a')), true, null), 'approved', 'venta A aprobada');
select is(public.review_transfer_payment(tp_test.pid(current_setting('tp.b')), true, null), 'approved', 'venta B aprobada');

-- Saldo: el evento todavía no pasó, así que nada está listo para liquidar.
select is((select owed_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 2000000::bigint, 'el saldo suma el precio base de las dos ventas (sin el cargo de ENPASS)');
select is((select owed_ready_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 0::bigint, 'con el evento por venir no hay nada listo');
select is((select count(*)::int from public.get_transfer_settlement_summary() where organization_name is not null and owed_amount = 2000000), 1, 'ENPASS ve el saldo en el resumen');

-- Sin datos de cobro del productor no se puede liquidar.
select throws_ok($$select public.create_transfer_payout('22222222-2222-4222-8222-222222222222', true)$$, 'P0001', 'PAYOUT_DETAILS_REQUIRED', 'sin datos de cobro no se crea la liquidación');
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000012","role":"authenticated"}';
select throws_ok($$select public.set_org_payout_details('22222222-2222-4222-8222-222222222222', 'X', null, 'otro.alias', null)$$, 'P0001', 'NOT_ALLOWED', 'un usuario ajeno no carga datos de cobro');
select throws_ok($$select * from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')$$, 'P0001', 'NOT_ALLOWED', 'un usuario ajeno no ve el saldo');
select throws_ok($$select public.create_transfer_payout('22222222-2222-4222-8222-222222222222', true)$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no crea liquidaciones');
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000011","role":"authenticated"}';
select lives_ok($$select public.set_org_payout_details('22222222-2222-4222-8222-222222222222', 'Productora Demo SRL', '30712345678', 'productora.demo', null)$$, 'se cargan los datos de cobro');
select throws_ok($$select public.set_org_payout_details('22222222-2222-4222-8222-222222222222', 'X', null, null, null)$$, 'P0001', 'ALIAS_OR_CBU_REQUIRED', 'se exige alias o CBU');

-- Evento por venir: solo entra si ENPASS lo pide.
select throws_ok($$select public.create_transfer_payout('22222222-2222-4222-8222-222222222222', false)$$, 'P0001', 'NOTHING_TO_SETTLE', 'por defecto no se liquidan eventos que no terminaron');
reset role;
update public.events set doors_open_at = null, starts_at = now() - interval '3 days', ends_at = now() - interval '2 days' where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000011","role":"authenticated"}';
select is((select owed_ready_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 2000000::bigint, 'terminado el evento, todo el saldo está listo');

-- Crear liquidación.
select set_config('tp.payout', public.create_transfer_payout('22222222-2222-4222-8222-222222222222', false)::text, true);
select is((select amount from public.transfer_payouts where id = current_setting('tp.payout')::uuid), 2000000::bigint, 'la liquidación suma las dos ventas');
select is((select orders_count from public.transfer_payouts where id = current_setting('tp.payout')::uuid), 2, 'cuenta las dos órdenes');
select is((select destination_snapshot->>'alias' from public.transfer_payouts where id = current_setting('tp.payout')::uuid), 'productora.demo', 'guarda a dónde se paga (foto de los datos)');
select is((select pending_payout_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 2000000::bigint, 'el saldo pasa a "en liquidación"');
select is((select owed_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 0::bigint, 'ya no queda saldo sin liquidar');
select throws_ok($$select public.create_transfer_payout('22222222-2222-4222-8222-222222222222', true)$$, 'P0001', 'NOTHING_TO_SETTLE', 'no se liquida dos veces lo mismo');

-- Cancelar devuelve las ventas al saldo; luego se crea de nuevo y se paga.
select lives_ok($$select public.cancel_transfer_payout(current_setting('tp.payout')::uuid)$$, 'se cancela una liquidación pendiente');
select is((select owed_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 2000000::bigint, 'las ventas vuelven al saldo');
select set_config('tp.payout', public.create_transfer_payout('22222222-2222-4222-8222-222222222222', false)::text, true);
select lives_ok($$select public.mark_transfer_payout_paid(current_setting('tp.payout')::uuid, 'Transf 0001234')$$, 'se marca pagada con su comprobante');
reset role;
select is((select sum(amount)::bigint from public.ledger_movements where organization_id = '22222222-2222-4222-8222-222222222222' and movement_type = 'payout'), -2000000::bigint, 'queda el asiento de la liquidación en el ledger');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-000000000011","role":"authenticated"}';
select throws_ok($$select public.cancel_transfer_payout(current_setting('tp.payout')::uuid)$$, 'P0001', 'PAYOUT_NOT_PENDING', 'una liquidación pagada no se puede cancelar');
select is((select paid_amount from public.get_transfer_balance('22222222-2222-4222-8222-222222222222')), 2000000::bigint, 'el saldo muestra lo ya pagado');

select * from finish();
rollback;
