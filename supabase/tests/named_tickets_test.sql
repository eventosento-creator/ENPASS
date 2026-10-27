begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Fixture: evento demo a futuro, entradas con cupo y en la misma etapa de venta.
update public.ticket_holds set expires_at = now() - interval '1 second' where status = 'active';
update public.events set doors_open_at = null, starts_at = now() + interval '10 days', ends_at = null where id = '44444444-4444-4444-8444-444444444444';
update public.ticket_types set quantity = 5000, sale_phase_id = null, sort_order = 0 where event_id = '44444444-4444-4444-8444-444444444444';
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to authenticated;

create schema nt;
create function nt.buy(p_email text, p_first text, p_doc text) returns text language sql as $$
  select order_public_id from public.create_guest_checkout_attributed('44444444-4444-4444-8444-444444444444', p_first, 'Comprador', p_email, '', p_doc,
    '[{"item_type":"ticket","item_id":"55555555-5555-4555-8555-555555555551","quantity":2},{"item_type":"ticket","item_id":"55555555-5555-4555-8555-555555555553","quantity":1}]'::jsonb, null,
    '7f7b3450-f64d-491c-827e-bfa66f8b7dab'::uuid, 'b599a49f-cf73-4205-ae42-96263422bf27'::uuid);
$$;
create function nt.credentials(p_order text, p_seed text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'unit_index', u, 'short_code', 'N' || upper(substr(md5(p_seed || oi.id::text), 1, 3)) || '-' || upper(substr(md5(oi.id::text || u::text), 1, 2)),
    'qr_token_hash', md5(p_seed || oi.id::text || u::text) || md5(u::text || oi.id::text || p_seed), 'qr_token_encrypted', repeat('x', 40)))
  from public.order_items oi join public.orders o on o.id = oi.order_id, generate_series(1, oi.quantity) u where o.public_id = p_order;
$$;

-- 1) Orden con 3 entradas: se guardan 3 titulares distintos.
select set_config('nt.a', nt.buy('named-a@example.invalid', 'Ana', '30111222'), true);
select is(public.set_order_ticket_holders(current_setting('nt.a'), jsonb_build_array(
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'Comprador', 'document', '30111222'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 2, 'first_name', 'Beto', 'last_name', 'Amigo', 'document', '30333444'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555553', 'unit_index', 1, 'first_name', 'Carla', 'last_name', 'Invitada', 'document', null))), 3, 'se guardan los 3 titulares');

-- 2) Validaciones: tienen que estar todas las posiciones, ninguna de más ni repetida.
select throws_ok($$select public.set_order_ticket_holders(current_setting('nt.a'), jsonb_build_array(
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X')))$$, 'P0001', 'HOLDERS_INCOMPLETE', 'faltan titulares: se rechaza');
select throws_ok($$select public.set_order_ticket_holders(current_setting('nt.a'), jsonb_build_array(
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 3, 'first_name', 'Ana', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555553', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X')))$$, 'P0001', 'INVALID_HOLDERS', 'una posición fuera de la cantidad comprada se rechaza');
select throws_ok($$select public.set_order_ticket_holders(current_setting('nt.a'), jsonb_build_array(
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555553', 'unit_index', 1, 'first_name', 'Ana', 'last_name', 'X')))$$, '23505', null, 'una posición repetida no deja pasar');
select throws_ok($$select public.set_order_ticket_holders(current_setting('nt.a'), jsonb_build_array(
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 1, 'first_name', '', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555551', 'unit_index', 2, 'first_name', 'B', 'last_name', 'X'),
  jsonb_build_object('ticket_type_id', '55555555-5555-4555-8555-555555555553', 'unit_index', 1, 'first_name', 'C', 'last_name', 'X')))$$, '23514', null, 'un nombre vacío se rechaza');
select is((select count(*) from public.order_ticket_holders where order_id = (select id from public.orders where public_id = current_setting('nt.a')))::int, 3, 'tras los rechazos quedan los 3 titulares válidos del primer envío');

-- 3) Al emitir, cada entrada sale con su titular.
update public.orders set status = 'paid' where public_id = current_setting('nt.a');
select lives_ok($$select public.issue_tickets_for_paid_order((select id from public.orders where public_id = current_setting('nt.a')), nt.credentials(current_setting('nt.a'), 'a'))$$, 'se emiten las 3 entradas');
select is((select string_agg(holder_first_name, ',' order by holder_first_name) from public.tickets where order_id = (select id from public.orders where public_id = current_setting('nt.a'))), 'Ana,Beto,Carla', 'cada entrada tiene su propio nombre');
select is((select holder_document from public.tickets where order_id = (select id from public.orders where public_id = current_setting('nt.a')) and holder_first_name = 'Beto'), '30333444', 'y su propio DNI');

-- 4) Sin titulares cargados (órdenes viejas, cortesías, taquilla, RRPP) todo sale con los datos del comprador, como antes.
select set_config('nt.b', nt.buy('named-b@example.invalid', 'Bruno', '27999888'), true);
update public.orders set status = 'paid' where public_id = current_setting('nt.b');
select lives_ok($$select public.issue_tickets_for_paid_order((select id from public.orders where public_id = current_setting('nt.b')), nt.credentials(current_setting('nt.b'), 'b'))$$, 'una orden sin titulares también se emite');
select is((select count(distinct holder_first_name) from public.tickets where order_id = (select id from public.orders where public_id = current_setting('nt.b')))::int, 1, 'todas salen con el nombre del comprador');

-- 5) El comprador cambia el nombre de su entrada.
select set_config('nt.t', (select id::text from public.tickets where order_id = (select id from public.orders where public_id = current_setting('nt.a')) and holder_first_name = 'Beto'), true);
select set_config('nt.cust', (select customer_id::text from public.orders where public_id = current_setting('nt.a')), true);
select lives_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[current_setting('nt.cust')::uuid], 'Diego', 'Reemplazo', '30555666')$$, 'el comprador cambia el titular de su entrada');
select is((select holder_first_name from public.tickets where id = current_setting('nt.t')::uuid), 'Diego', 'el nombre quedó cambiado');
select is((select count(*) from public.audit_logs where action = 'ticket.holder.changed' and entity_id = current_setting('nt.t')::uuid)::int, 1, 'el cambio queda auditado');
select throws_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[gen_random_uuid()], 'Otro', 'Intruso', null)$$, 'P0001', 'NOT_ALLOWED', 'otra persona no puede cambiar la entrada');

-- 6) Solo entradas sin usar y con tiempo.
update public.tickets set used_entries = 1 where id = current_setting('nt.t')::uuid;
select throws_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[current_setting('nt.cust')::uuid], 'Tarde', 'Cambio', null)$$, 'P0001', 'NOT_EDITABLE', 'una entrada ya usada no se cambia');
update public.tickets set used_entries = 0 where id = current_setting('nt.t')::uuid;
update public.events set starts_at = now() + interval '2 hours' where id = '44444444-4444-4444-8444-444444444444';
select throws_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[current_setting('nt.cust')::uuid], 'Muy', 'Tarde', null)$$, 'P0001', 'EDIT_WINDOW_CLOSED', 'a menos de 3 horas del evento ya no se cambia');
update public.events set starts_at = now() + interval '10 days', require_document = true where id = '44444444-4444-4444-8444-444444444444';
select throws_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[current_setting('nt.cust')::uuid], 'Sin', 'Dni', null)$$, 'P0001', 'DOCUMENT_REQUIRED', 'si el evento pide DNI, el cambio también lo pide');
select throws_ok($$select public.update_ticket_holder(current_setting('nt.t')::uuid, array[current_setting('nt.cust')::uuid], 'Dni', 'Malo', '12')$$, 'P0001', 'INVALID_DOCUMENT', 'un DNI inválido se rechaza');


-- 7) El productor corrige el titular (también con la entrada usada y cerca del evento).
update public.events set starts_at = now() + interval '10 days', require_document = false where id = '44444444-4444-4444-8444-444444444444';
update public.tickets set used_entries = 1 where id = current_setting('nt.t')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.update_ticket_holder_as_manager(current_setting('nt.t')::uuid, 'Elena', 'Correccion', null)$$, 'el productor corrige el nombre de una entrada');
select is((select holder_first_name from public.tickets where id = current_setting('nt.t')::uuid), 'Elena', 'el nombre quedó corregido');
select is((select count(*) from public.audit_logs where action = 'ticket.holder.changed' and entity_id = current_setting('nt.t')::uuid and after_data->>'by' = 'organizer')::int, 1, 'queda auditado como cambio del organizador');
select throws_ok($$select public.update_ticket_holder_as_manager(current_setting('nt.t')::uuid, '', 'Sin nombre', null)$$, 'P0001', 'INVALID_NAME', 'un nombre vacío se rechaza');
reset role;
update public.tickets set status = 'cancelled', cancelled_at = now() where id = current_setting('nt.t')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select public.update_ticket_holder_as_manager(current_setting('nt.t')::uuid, 'No', 'Aplica', null)$$, 'P0001', 'NOT_EDITABLE', 'una entrada anulada no se edita');
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
select throws_ok($$select public.update_ticket_holder_as_manager(current_setting('nt.t')::uuid, 'Ajeno', 'Intruso', null)$$, 'P0001', 'NOT_ALLOWED', 'otra organización no puede editar');
reset role;
set local role anon;
select throws_ok($$select public.update_ticket_holder_as_manager(current_setting('nt.t')::uuid, 'Anon', 'Ymo', null)$$, '42501', null, 'sin sesión no se puede');
reset role;

select * from finish();
rollback;
