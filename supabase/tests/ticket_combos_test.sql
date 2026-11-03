begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Fixture: evento demo a futuro. Combo "Combo x4" (4 ingresos, $4.000, cupo 8 personas = 2 combos) y la entrada normal "Pista".
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.events set doors_open_at = null, starts_at = now() + interval '10 days', ends_at = null where id = '44444444-4444-4444-8444-444444444444';
update public.ticket_types set quantity = 5000, sale_phase_id = null, sort_order = 0 where event_id = '44444444-4444-4444-8444-444444444444';
insert into public.ticket_types (id, organization_id, event_id, name, price_amount, currency, quantity, max_per_order, entries_per_unit, sort_order)
values ('99999999-9999-4999-8999-999999999991', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444', 'Combo x4', 400000, 'ARS', 8, 5, 4, 0);
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to authenticated;

create schema cb;
create function cb.buy(p_email text, p_qty int) returns text language sql as $$
  select order_public_id from public.create_guest_checkout_attributed('44444444-4444-4444-8444-444444444444', 'Comprador', 'Combo', p_email, '', '30111222',
    jsonb_build_array(jsonb_build_object('item_type','ticket','item_id','99999999-9999-4999-8999-999999999991','quantity',p_qty)), null,
    (select id from public.legal_documents where type = 'terms_buyer' and status = 'active' limit 1),
    (select id from public.legal_documents where type = 'refund_policy' and status = 'active' limit 1));
$$;
create function cb.credentials(p_order text, p_seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'unit_index', u, 'short_code', 'N' || upper(substr(md5(p_seed || oi.id::text), 1, 3)) || '-' || upper(substr(md5(oi.id::text || u::text), 1, 2)),
    'qr_token_hash', md5(p_seed || oi.id::text || u::text) || md5(u::text || oi.id::text || p_seed), 'qr_token_encrypted', repeat('x', 40)))
  from public.order_items oi join public.orders o on o.id = oi.order_id, generate_series(1, oi.quantity * coalesce((select entries_per_unit from public.ticket_types where id = oi.ticket_type_id), 1)) u where o.public_id = p_order;
$$;

-- 1) La página muestra combos disponibles (8 personas / 4 = 2).
select is((select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '99999999-9999-4999-8999-999999999991'), 2::bigint, 'quedan 2 combos (8 personas / 4)');
select is((select entries_per_unit from public.get_event_combo_sizes('44444444-4444-4444-8444-444444444444') where ticket_type_id = '99999999-9999-4999-8999-999999999991'), 4, 'el tamaño del combo se puede consultar');

-- 2) Comprar 1 combo: la orden es de 1 combo por $4.000 y la reserva cuenta 4 personas.
select set_config('cb.a', cb.buy('combo-a@example.invalid', 1), true);
select is((select quantity from public.order_items where order_id = (select id from public.orders where public_id = current_setting('cb.a'))), 1, 'la orden tiene 1 combo');
select is((select subtotal_amount from public.orders where public_id = current_setting('cb.a')), 400000::bigint, 'el precio es el del combo entero');
select is((select quantity from public.ticket_holds where order_id = (select id from public.orders where public_id = current_setting('cb.a'))), 4, 'la reserva cuenta 4 personas');
select is((select available_quantity from public.get_public_ticket_types('44444444-4444-4444-8444-444444444444') where id = '99999999-9999-4999-8999-999999999991'), 1::bigint, 'queda 1 combo');

-- 3) Al pagar salen 4 entradas, una por persona, cada una con su QR.
update public.orders set status = 'paid' where public_id = current_setting('cb.a');
select lives_ok($$select public.issue_tickets_for_paid_order((select id from public.orders where public_id = current_setting('cb.a')), cb.credentials(current_setting('cb.a'), 'a'))$$, 'se emiten las entradas del combo');
select is((select count(*) from public.tickets where order_id = (select id from public.orders where public_id = current_setting('cb.a')))::int, 4, 'el combo da 4 entradas');
select is((select count(distinct qr_token_hash) from public.tickets where order_id = (select id from public.orders where public_id = current_setting('cb.a')))::int, 4, 'cada entrada tiene su QR');
select lives_ok($$select public.issue_tickets_for_paid_order((select id from public.orders where public_id = current_setting('cb.a')), cb.credentials(current_setting('cb.a'), 'a'))$$, 'emitir de nuevo no duplica');
select is((select count(*) from public.tickets where order_id = (select id from public.orders where public_id = current_setting('cb.a')))::int, 4, 'siguen siendo 4 entradas');

-- 4) Cupo: 2 combos de 2 caben (1 ya vendido + 1), pero no un tercero.
select lives_ok($$select cb.buy('combo-b@example.invalid', 1)$$, 'el segundo combo entra');
select throws_ok($$select cb.buy('combo-c@example.invalid', 1)$$, 'P0001', 'TICKET_TYPE_SOLD_OUT', 'el tercero se rechaza por cupo');

-- 5) Las cortesías no soportan combos.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select public.create_courtesy_checkout('44444444-4444-4444-8444-444444444444', '99999999-9999-4999-8999-999999999991', 'Cor', 'Tesia', 'cor@example.invalid', 1)$$, 'P0001', 'COMBO_NOT_SUPPORTED', 'una cortesía de combo se rechaza');
reset role;

select * from finish();
rollback;
