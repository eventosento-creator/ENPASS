begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

-- Fixture: evento "Noche 2000" (Club Demo, cargo de servicio 8%). Preventa 1 = $10.000, General = $16.000 (en centavos).
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.ticket_types set quantity = 5000 where event_id = '44444444-4444-4444-8444-444444444444';
update public.events set capacity = 5000 where id = '44444444-4444-4444-8444-444444444444';
-- Las tres entradas en la misma etapa de venta (si no, solo está abierta la más barata y no se pueden mezclar).
update public.ticket_types set sale_phase_id = null, sort_order = 0 where event_id = '44444444-4444-4444-8444-444444444444';
insert into public.payment_accounts (id, organization_id, provider, provider_account_id, access_token_encrypted, refresh_token_encrypted, live_mode, status, connected_at)
values ('aaaaaaaa-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', 'mercado_pago', 'promo-test-seller', 'enc', 'enc', false, 'connected', now());

create schema promo_test;
grant usage on schema promo_test to authenticated, anon;

-- Compra con cupón / sin cupón / consulta de la orden más reciente de un email.
create function promo_test.buy(code text, email text, selections jsonb, ev uuid default '44444444-4444-4444-8444-444444444444') returns text language sql as $$
  select order_public_id from public.create_guest_checkout_promoted(ev, 'Test', 'Buyer', email, '', '', selections, null,
    '7f7b3450-f64d-491c-827e-bfa66f8b7dab'::uuid, 'b599a49f-cf73-4205-ae42-96263422bf27'::uuid, code);
$$;
create function promo_test.plain(email text, selections jsonb) returns text language sql as $$
  select order_public_id from public.create_guest_checkout_attributed('44444444-4444-4444-8444-444444444444', 'Test', 'Buyer', email, '', '', selections, null,
    '7f7b3450-f64d-491c-827e-bfa66f8b7dab'::uuid, 'b599a49f-cf73-4205-ae42-96263422bf27'::uuid);
$$;
create function promo_test.ord(p_email text) returns setof public.orders language sql as $$
  select o.* from public.orders o join public.customers c on c.id = o.customer_id where c.email = lower(p_email) order by o.created_at desc, o.id limit 1;
$$;
create function promo_test.p1(qty int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_type', 'ticket', 'item_id', '55555555-5555-4555-8555-555555555551', 'quantity', qty));
$$;
create function promo_test.p1_gen() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('item_type', 'ticket', 'item_id', '55555555-5555-4555-8555-555555555551', 'quantity', 1),
    jsonb_build_object('item_type', 'ticket', 'item_id', '55555555-5555-4555-8555-555555555553', 'quantity', 1));
$$;
-- Crea una promoción como el dueño del club (usa la misma función que el panel).
create function promo_test.mk(code text, kind text, pct int default null, fixed bigint default null, special bigint default null,
  events uuid[] default array['44444444-4444-4444-8444-444444444444']::uuid[], ttypes uuid[] default null,
  starts timestamptz default null, ends timestamptz default null, max_total int default null, per_buyer int default null,
  max_tickets int default null, min_tickets int default 1, max_discount bigint default null, active boolean default true)
returns uuid language sql as $$
  select public.upsert_promotion('22222222-2222-4222-8222-222222222222', null, 'Promo ' || code, code, null, kind, pct, fixed, special, active,
    false, events, ttypes, starts, ends, max_total, per_buyer, max_tickets, min_tickets, max_discount);
$$;
grant execute on all functions in schema promo_test to authenticated, anon;

-- Dueño de Club Demo crea las promociones.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select promo_test.mk('PCT20', 'percent', pct => 2000)$$, 'el productor crea un cupón porcentual');
select promo_test.mk('FIX5', 'fixed', fixed => 500000);
select promo_test.mk('FIXBIG', 'fixed', fixed => 5000000);
select promo_test.mk('FREE2', 'free', max_tickets => 2, ttypes => array['55555555-5555-4555-8555-555555555551']::uuid[]);
select promo_test.mk('TWO41', 'two_for_one');
select promo_test.mk('SPECIAL', 'special_price', special => 700000);
select promo_test.mk('SPECIALHI', 'special_price', special => 2000000);
select promo_test.mk('VENCIDO', 'percent', pct => 1000, starts => now() - interval '10 days', ends => now() - interval '1 day');
select promo_test.mk('FUTURO', 'percent', pct => 1000, starts => now() + interval '5 days');
select promo_test.mk('APAGADO', 'percent', pct => 1000, active => false);
select promo_test.mk('OTROEVENTO', 'percent', pct => 1000, events => array['77777777-7777-4777-8777-777777777771']::uuid[]);
select promo_test.mk('SOLOGEN', 'percent', pct => 1000, ttypes => array['55555555-5555-4555-8555-555555555553']::uuid[]);
select promo_test.mk('POREMAIL', 'percent', pct => 1000, per_buyer => 1);
select promo_test.mk('LIM2', 'percent', pct => 1000, max_total => 2);
select promo_test.mk('TOPE1', 'percent', pct => 5000, max_tickets => 1);
select promo_test.mk('TOPEMONTO', 'percent', pct => 5000, max_discount => 300000);
select promo_test.mk('MIN3', 'percent', pct => 1000, min_tickets => 3);
select promo_test.mk('CICLO', 'percent', pct => 1000, max_total => 1);
select promo_test.mk('PAGO', 'percent', pct => 2000);
reset role;

-- ---- Porcentaje y cargo de servicio ENPASS sin cambios ----
select lives_ok($$select promo_test.buy('PCT20', 'a1@t.local', promo_test.p1(1))$$, 'porcentaje válido: reserva con cupón');
select is((select discount_amount from promo_test.ord('a1@t.local')), 200000::bigint, '20% sobre $10.000 = $2.000');
select is((select subtotal_amount from promo_test.ord('a1@t.local')), 800000::bigint, 'el subtotal queda con el descuento');
select is((select list_subtotal_amount from promo_test.ord('a1@t.local')), 1000000::bigint, 'el precio base original queda guardado aparte');
select is((select service_fee_amount from promo_test.ord('a1@t.local')), 80000::bigint, 'el cargo ENPASS sigue siendo 8% del precio BASE');
select is((select total_amount from promo_test.ord('a1@t.local')), 880000::bigint, 'total = subtotal con descuento + cargo');
select lives_ok($$select promo_test.plain('b1@t.local', promo_test.p1(1))$$, 'compra sin cupón funciona como siempre');
select is((select service_fee_amount from promo_test.ord('b1@t.local')), (select service_fee_amount from promo_test.ord('a1@t.local')), 'el cargo es idéntico con y sin cupón');
select is((select discount_amount || '/' || coalesce(promotion_id::text, 'sin') || '/' || coalesce(list_subtotal_amount::text, 'null') from promo_test.ord('b1@t.local')), '0/sin/null', 'una compra sin cupón no registra descuento');
select is((select discount_amount || '/' || line_total_amount from public.order_items where order_id = (select id from promo_test.ord('a1@t.local'))), '200000/800000', 'la línea guarda descuento y total neto');

-- ---- Monto fijo ----
select lives_ok($$select promo_test.buy('FIX5', 'a2@t.local', promo_test.p1(2))$$, 'monto fijo válido');
select is((select discount_amount from promo_test.ord('a2@t.local')), 1000000::bigint, 'monto fijo: $5.000 por entrada beneficiada');
select lives_ok($$select promo_test.buy('FIXBIG', 'a3@t.local', promo_test.p1(1))$$, 'descuento fijo mayor al precio');
select is((select subtotal_amount from promo_test.ord('a3@t.local')), 0::bigint, 'el precio de la entrada nunca es negativo (queda en 0)');
select is((select total_amount from promo_test.ord('a3@t.local')), 80000::bigint, 'ENPASS mantiene su cargo aunque la entrada quede en $0');

-- ---- 100% / cortesía ----
select lives_ok($$select promo_test.buy('FREE2', 'a4@t.local', promo_test.p1(2))$$, 'cupón 100%: reserva');
select is((select total_amount || '/' || service_fee_amount || '/' || is_courtesy from promo_test.ord('a4@t.local')), '0/0/true', '100%: total 0, sin cargo, tratada como cortesía');
select lives_ok($$select public.complete_free_order((select public_id from promo_test.ord('a4@t.local')))$$, 'la cortesía se confirma sin pasar por Mercado Pago');
select is((select coalesce(sum(amount), 0)::bigint from public.ledger_movements where order_id = (select id from promo_test.ord('a4@t.local'))), -40000::bigint, 'se registra el costo de emisión de cortesía (configurable por organización: $200 por entrada acá)');
select is((select status from public.promotion_redemptions where order_id = (select id from promo_test.ord('a4@t.local'))), 'confirmed', 'al confirmarse la orden, el uso queda confirmado');
select throws_ok($$select promo_test.buy('FREE2', 'a5@t.local', promo_test.p1_gen())$$, 'P0001', 'CODE_FREE_ONLY_ELIGIBLE', '100% no se mezcla con entradas no incluidas');
select throws_ok($$select promo_test.buy('FREE2', 'a6@t.local', promo_test.p1(3))$$, 'P0001', 'CODE_FREE_LIMIT', '100% respeta el máximo de entradas');
select is((select count(*) from public.customers where email = 'a5@t.local'), 0::bigint, 'una compra rechazada no deja orden ni cliente (se deshace todo)');

-- ---- 2x1 ----
select lives_ok($$select promo_test.buy('TWO41', 'a7@t.local', promo_test.p1(3))$$, '2x1 con 3 entradas');
select is((select discount_amount from promo_test.ord('a7@t.local')), 1000000::bigint, '2x1: de 3 entradas iguales, 1 gratis');
select lives_ok($$select promo_test.buy('TWO41', 'a8@t.local', promo_test.p1_gen())$$, '2x1 con entradas de distinto precio');
select is((select discount_amount from promo_test.ord('a8@t.local')), 1000000::bigint, '2x1 mixto: se regala la más barata del par');
select throws_ok($$select promo_test.buy('TWO41', 'a9@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_MIN_TICKETS', '2x1 pide al menos 2 entradas');

-- ---- Precio promocional ----
select lives_ok($$select promo_test.buy('SPECIAL', 'c1@t.local', promo_test.p1(1))$$, 'precio promocional');
select is((select subtotal_amount from promo_test.ord('c1@t.local')), 700000::bigint, 'la entrada cuesta el precio especial');
select is((select price_amount from public.ticket_types where id = '55555555-5555-4555-8555-555555555551'), 1000000::bigint, 'el precio público original no se modifica');
select throws_ok($$select promo_test.buy('SPECIALHI', 'c2@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_NO_DISCOUNT', 'un precio especial más alto que el real no genera descuento');

-- ---- Vigencia, estado, alcance ----
select throws_ok($$select promo_test.buy('VENCIDO', 'd1@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_EXPIRED', 'cupón vencido');
select throws_ok($$select promo_test.buy('FUTURO', 'd2@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_NOT_STARTED', 'cupón que todavía no empezó');
select throws_ok($$select promo_test.buy('APAGADO', 'd3@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_INACTIVE', 'cupón desactivado');
select throws_ok($$select promo_test.buy('NOEXISTE', 'd4@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_NOT_FOUND', 'código inexistente');
select throws_ok($$select promo_test.buy('OTROEVENTO', 'd5@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_WRONG_EVENT', 'cupón de otro evento');
select throws_ok($$select promo_test.buy('SOLOGEN', 'd6@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_NOT_APPLICABLE', 'cupón que no aplica a la categoría elegida');
select lives_ok($$select promo_test.buy('SOLOGEN', 'd7@t.local', promo_test.p1_gen())$$, 'cupón de una categoría en una compra mixta');
select is((select discount_amount from promo_test.ord('d7@t.local')), 160000::bigint, 'el descuento aplica solo a la categoría elegida (10% de $16.000)');
select lives_ok($$select promo_test.buy('  pct20 ', 'd8@t.local', promo_test.p1(1))$$, 'el código no distingue mayúsculas ni espacios');
select throws_ok($$select promo_test.buy('MIN3', 'd9@t.local', promo_test.p1(2))$$, 'P0001', 'CODE_MIN_TICKETS', 'cantidad mínima de entradas');
select lives_ok($$select promo_test.buy('MIN3', 'd10@t.local', promo_test.p1(3))$$, 'al llegar a la cantidad mínima se aplica');

-- ---- Límites y topes ----
select lives_ok($$select promo_test.buy('POREMAIL', 'e1@t.local', promo_test.p1(1))$$, 'primer uso por comprador');
select throws_ok($$select promo_test.buy('POREMAIL', 'e1@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_BUYER_LIMIT', 'máximo de usos por comprador');
select lives_ok($$select promo_test.buy('POREMAIL', 'e2@t.local', promo_test.p1(1))$$, 'otro comprador sí puede usarlo');
select lives_ok($$select promo_test.buy('LIM2', 'f1@t.local', promo_test.p1(1))$$, 'uso 1 de 2');
select lives_ok($$select promo_test.buy('LIM2', 'f2@t.local', promo_test.p1(1))$$, 'uso 2 de 2');
select throws_ok($$select promo_test.buy('LIM2', 'f3@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_EXHAUSTED', 'cupón agotado: el tercero no puede');
select lives_ok($$select promo_test.buy('TOPE1', 'g1@t.local', promo_test.p1(2))$$, 'tope de entradas beneficiadas');
select is((select discount_amount from promo_test.ord('g1@t.local')), 500000::bigint, 'solo 1 de las 2 entradas recibe el 50%');
select lives_ok($$select promo_test.buy('TOPEMONTO', 'g2@t.local', promo_test.p1(1))$$, 'tope de descuento monetario');
select is((select discount_amount from promo_test.ord('g2@t.local')), 300000::bigint, 'el descuento no supera el tope ($3.000)');

-- ---- Ciclo de vida del uso: reserva, vencimiento, pago, reembolso ----
select lives_ok($$select promo_test.buy('CICLO', 'h1@t.local', promo_test.p1(1))$$, 'reserva el único uso disponible');
select throws_ok($$select promo_test.buy('CICLO', 'h2@t.local', promo_test.p1(1))$$, 'P0001', 'CODE_EXHAUSTED', 'mientras está reservado nadie más lo puede usar');
update public.orders set status = 'expired' where id = (select id from promo_test.ord('h1@t.local'));
select is((select status || '/' || release_reason from public.promotion_redemptions where order_id = (select id from promo_test.ord('h1@t.local'))), 'released/expired', 'al vencer la compra, el uso se libera');
select lives_ok($$select promo_test.buy('CICLO', 'h3@t.local', promo_test.p1(1))$$, 'liberado, otro comprador lo puede usar');
select lives_ok($$select * from public.prepare_payment_attempt((select public_id from promo_test.ord('h3@t.local')))$$, 'prepara el pago de la compra con cupón');
select is((select gross_amount || '/' || service_fee_amount || '/' || platform_fee_amount from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))),
  (select total_amount || '/' || service_fee_amount || '/' || service_fee_amount from promo_test.ord('h3@t.local')), 'se cobra el total validado y la comisión de plataforma sigue siendo el cargo ENPASS');
select is(public.process_payment_update(
  (select public_id from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))), 'mp-promo-bad', 'approved'::public.payment_status, 'approved', 'accredited',
  1080000, 'ARS'::char(3), 50000, 900000, now()), 'amount_or_currency_mismatch', 'un pago por el precio SIN descuento se rechaza (importe distinto al validado)');
select is((select status from public.promotion_redemptions where order_id = (select id from promo_test.ord('h3@t.local'))), 'reserved', 'un pago con error no consume el cupón');
select is(public.process_payment_update(
  (select public_id from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))), 'mp-promo-ok', 'approved'::public.payment_status, 'approved', 'accredited',
  (select total_amount from promo_test.ord('h3@t.local')), 'ARS'::char(3), 50000, 900000, now()), 'approved', 'el pago por el total con descuento se aprueba');
select is((select status from public.promotion_redemptions where order_id = (select id from promo_test.ord('h3@t.local'))), 'confirmed', 'al aprobarse el pago el uso queda confirmado');
select is((select amount from public.ledger_movements where order_id = (select id from promo_test.ord('h3@t.local')) and movement_type = 'ticket_sale'), 900000::bigint, 'el libro contable registra la venta con el precio ya descontado');
select is(public.process_payment_update(
  (select public_id from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))), 'mp-promo-ok', 'approved'::public.payment_status, 'approved', 'accredited',
  (select total_amount from promo_test.ord('h3@t.local')), 'ARS'::char(3), 50000, 900000, now()), 'already_approved', 'un webhook repetido no consume otro uso');
select is(public.promotion_usage((select id from public.promotions where code = 'CICLO')), 1, 'el cupón registra un solo uso confirmado');
select public.process_payment_update(
  (select public_id from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))), 'mp-promo-ok', 'partially_refunded'::public.payment_status, 'refunded', 'partially_refunded',
  (select total_amount from promo_test.ord('h3@t.local')), 'ARS'::char(3), 50000, 900000, now(), 100000);
select is((select status from public.promotion_redemptions where order_id = (select id from promo_test.ord('h3@t.local'))), 'confirmed', 'un reembolso parcial no libera el uso');
select public.process_payment_update(
  (select public_id from public.payments where order_id = (select id from promo_test.ord('h3@t.local'))), 'mp-promo-ok', 'refunded'::public.payment_status, 'refunded', 'refunded',
  (select total_amount from promo_test.ord('h3@t.local')), 'ARS'::char(3), 50000, 900000, now(), (select total_amount from promo_test.ord('h3@t.local')));
select is((select status from public.promotion_redemptions where order_id = (select id from promo_test.ord('h3@t.local'))), 'refunded', 'un reembolso total marca el uso como reembolsado');
select is(public.promotion_usage((select id from public.promotions where code = 'CICLO')), 0, 'y libera el cupo del cupón');

-- ---- Aislamiento entre productores y permisos ----
insert into auth.users (id, email, instance_id, aud, role) values ('bb000000-0000-4000-8000-0000000000b1', 'otro-prod@t.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.organization_members (organization_id, user_id, role) values ('f8bc49f3-0ceb-4a77-854a-21d443b7cec8', 'bb000000-0000-4000-8000-0000000000b1', 'owner');
select throws_ok($$select promo_test.buy('PCT20', 'i1@t.local', jsonb_build_array(jsonb_build_object('item_type', 'ticket', 'item_id', '540e55a4-996d-41f3-8f19-f9af964bd5b9', 'quantity', 1)), '25ee37e2-7b42-4bd4-99af-3a5fb849eb58')$$, 'P0001', 'CODE_NOT_FOUND', 'un cupón de un productor no funciona en eventos de otro');
set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is((select count(*) from public.promotions), 0::bigint, 'otro productor no ve las promociones ajenas');
select is((select count(*) from public.promotion_redemptions), 0::bigint, 'ni sus canjes');
select throws_ok($$select * from public.get_promotions_overview('22222222-2222-4222-8222-222222222222')$$, 'P0001', 'NOT_ALLOWED', 'ni sus estadísticas');
select throws_ok($$select public.set_promotion_active('22222222-2222-4222-8222-222222222222', (select id from public.promotions limit 1), false)$$, 'P0001', 'NOT_ALLOWED', 'ni puede desactivarlas');
select throws_ok($$select public.upsert_promotion('f8bc49f3-0ceb-4a77-854a-21d443b7cec8', null, 'Intruso', 'INTRUSO', null, 'percent', 1000, null, null, true, false,
  array['44444444-4444-4444-8444-444444444444']::uuid[], null, null, null, null, null, null, 1, null)$$, 'P0001', 'EVENT_NOT_ALLOWED', 'no se pueden asociar eventos de otra organización');
select throws_ok($$select public.upsert_promotion('22222222-2222-4222-8222-222222222222', null, 'Intruso', 'INTRUSO', null, 'percent', 1000, null, null, true, true,
  null, null, null, null, null, null, null, 1, null)$$, 'P0001', 'NOT_ALLOWED', 'ni crear promociones en una organización ajena');
-- El mismo código puede existir en otra organización (el código es único por productor).
select lives_ok($$select public.upsert_promotion('f8bc49f3-0ceb-4a77-854a-21d443b7cec8', null, 'Propio', 'PCT20', null, 'percent', 1000, null, null, true, false,
  array['25ee37e2-7b42-4bd4-99af-3a5fb849eb58']::uuid[], null, null, null, null, null, null, 1, null)$$, 'el mismo código puede usarse en otra organización');
-- Ni anon ni authenticated pueden ejecutar el motor ni reservar: solo el servidor.
select throws_ok($$select public.preview_promotion('44444444-4444-4444-8444-444444444444', 'PCT20', '[]'::jsonb, 'x@t.local')$$, '42501', null, 'la vista previa solo la ejecuta el servidor');
select throws_ok($$select * from public.create_guest_checkout_promoted('44444444-4444-4444-8444-444444444444', 'a', 'b', 'x@t.local', '', '', '[]'::jsonb, null, gen_random_uuid(), gen_random_uuid(), 'PCT20')$$, '42501', null, 'la reserva con cupón solo la ejecuta el servidor');
reset role;

-- ---- Panel: duplicar, desactivar, estadísticas y auditoría ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.duplicate_promotion('22222222-2222-4222-8222-222222222222', (select id from public.promotions where code = 'PCT20' and organization_id = '22222222-2222-4222-8222-222222222222'))$$, 'duplicar una promoción');
select is((select active::text || '/' || (code <> 'PCT20')::text from public.promotions where name = 'Promo PCT20 (copia)'), 'false/true', 'la copia queda inactiva y con otro código');
select lives_ok($$select public.set_promotion_active('22222222-2222-4222-8222-222222222222', (select id from public.promotions where code = 'PCT20' and organization_id = '22222222-2222-4222-8222-222222222222'), false)$$, 'desactivar un cupón');
select is((select count(*) from public.orders where promotion_id = (select id from public.promotions where code = 'PCT20' and organization_id = '22222222-2222-4222-8222-222222222222') and status = 'pending'), 2::bigint, 'desactivarlo no afecta las compras ya creadas');
select is((select uses_confirmed || '/' || uses_pending from public.get_promotions_overview('22222222-2222-4222-8222-222222222222') where code = 'FREE2'), '1/0', 'las estadísticas separan usos confirmados y pendientes');
select is((select discount_amount from public.get_promotions_overview('22222222-2222-4222-8222-222222222222') where code = 'FREE2'), 2000000::bigint, 'el ahorro otorgado cuenta solo lo confirmado');
select is((select count(*) from public.audit_logs where entity_type = 'promotion' and action in ('promotion.created', 'promotion.deactivated', 'promotion.duplicated') and organization_id = '22222222-2222-4222-8222-222222222222' and created_at = now()), 21::bigint, 'creación, copia y desactivación quedan auditadas');
reset role;

select * from finish();
rollback;
