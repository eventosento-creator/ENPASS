begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.h(value text) returns text language sql as $$ select encode(extensions.digest(convert_to(value, 'UTF8'), 'sha256'), 'hex') $$;
-- Pedido de acceso para compradora@example.com con código 123456 (los hashes los arma la app; acá se simulan).
select ok(public.create_buyer_access_token('compradora@example.com', pg_temp.h('tok1'), pg_temp.h('compradora@example.com'), now() + interval '15 minutes') is not null, 'se crea el pedido de acceso');
select ok(public.set_buyer_access_code(pg_temp.h('tok1'), pg_temp.h('123456:' || pg_temp.h('compradora@example.com'))), 'se asocia el código al pedido');

-- Código incorrecto: no entra y cuenta el intento.
select is(public.exchange_buyer_access_code(pg_temp.h('compradora@example.com'), pg_temp.h('000000:' || pg_temp.h('compradora@example.com')), pg_temp.h('sess1'), now() + interval '30 days'), false, 'un código incorrecto no entra');
select is((select code_attempts from public.buyer_access_tokens where token_hash = pg_temp.h('tok1')), 1, 'el intento fallido se cuenta');

-- Código correcto: crea la sesión con el email verificado.
select is(public.exchange_buyer_access_code(pg_temp.h('compradora@example.com'), pg_temp.h('123456:' || pg_temp.h('compradora@example.com')), pg_temp.h('sess1'), now() + interval '30 days'), true, 'el código correcto entra');
select is(public.get_buyer_session_email(pg_temp.h('sess1')), 'compradora@example.com', 'la sesión guarda el email verificado');
select is(public.exchange_buyer_access_code(pg_temp.h('compradora@example.com'), pg_temp.h('123456:' || pg_temp.h('compradora@example.com')), pg_temp.h('sess2'), now() + interval '30 days'), false, 'el código es de un solo uso');

-- Tope de 5 intentos: después de 5 fallos ni el código correcto sirve.
select public.create_buyer_access_token('otra@example.com', pg_temp.h('tok2'), pg_temp.h('otra@example.com'), now() + interval '15 minutes');
select public.set_buyer_access_code(pg_temp.h('tok2'), pg_temp.h('222222:' || pg_temp.h('otra@example.com')));
select public.exchange_buyer_access_code(pg_temp.h('otra@example.com'), pg_temp.h('000001:' || pg_temp.h('otra@example.com')), pg_temp.h('s3'), now() + interval '30 days') from generate_series(1, 5);
select is(public.exchange_buyer_access_code(pg_temp.h('otra@example.com'), pg_temp.h('222222:' || pg_temp.h('otra@example.com')), pg_temp.h('s4'), now() + interval '30 days'), false, 'tras 5 intentos fallidos el código queda bloqueado');

-- Un pedido nuevo invalida el código anterior.
select public.create_buyer_access_token('nueva@example.com', pg_temp.h('tok3'), pg_temp.h('nueva@example.com'), now() + interval '15 minutes');
select public.set_buyer_access_code(pg_temp.h('tok3'), pg_temp.h('333333:' || pg_temp.h('nueva@example.com')));
select public.create_buyer_access_token('nueva@example.com', pg_temp.h('tok4'), pg_temp.h('nueva@example.com'), now() + interval '15 minutes');
select public.set_buyer_access_code(pg_temp.h('tok4'), pg_temp.h('444444:' || pg_temp.h('nueva@example.com')));
select is(public.exchange_buyer_access_code(pg_temp.h('nueva@example.com'), pg_temp.h('333333:' || pg_temp.h('nueva@example.com')), pg_temp.h('s5'), now() + interval '30 days'), false, 'el código del pedido anterior ya no sirve');

select * from finish();
rollback;
