begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-0000000000d1', 'admin-fin@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into auth.users (id, email, aud, role) values ('bb000000-0000-4000-8000-0000000000d2', 'plain-fin@example.invalid', 'authenticated', 'authenticated') on conflict do nothing;
insert into public.platform_admins (user_id) values ('bb000000-0000-4000-8000-0000000000d1');

-- Datos cargados antes (como dueño de la base).
insert into public.platform_expenses (expense_date, concept, category, amount_cents, kind) values ('2026-11-10', 'Dominio', 'infraestructura', 1500000, 'variable');
insert into public.platform_recurring_expenses (concept, category, amount_cents, starts_on, ends_on) values
  ('Vercel', 'infraestructura', 2000000, '2026-01-01', '2026-10-31'),
  ('Vercel', 'infraestructura', 2500000, '2026-11-01', null),
  ('Contador', 'contador', 4000000, '2026-12-01', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000d2","role":"authenticated"}';
select throws_ok($$select public.admin_finance_month('2026-11-01')$$, 'P0001', 'NOT_ALLOWED', 'un usuario común no ve la caja');
select is((select count(*)::int from public.platform_expenses), 0, 'un usuario común no lee los gastos');
select is((select count(*)::int from public.platform_recurring_expenses), 0, 'ni los gastos fijos');
select throws_ok($$insert into public.platform_expenses (expense_date, concept, category, amount_cents) values ('2026-11-01', 'x', 'otros', 100)$$, '42501', null, 'ni puede cargar gastos');

set local request.jwt.claims = '{"sub":"bb000000-0000-4000-8000-0000000000d1","role":"authenticated"}';
select is(jsonb_array_length(public.admin_finance_month('2026-11-15')->'expenses'), 1, 'el administrador ve los gastos del mes');
select is(jsonb_array_length(public.admin_finance_month('2026-10-15')->'expenses'), 0, 'y no los de otros meses');
select is((select r->>'amount_cents' from jsonb_array_elements(public.admin_finance_month('2026-11-15')->'recurring') r where r->>'concept' = 'Vercel'), '2500000', 'en noviembre rige el monto nuevo del gasto fijo');
select is((select r->>'amount_cents' from jsonb_array_elements(public.admin_finance_month('2026-10-15')->'recurring') r where r->>'concept' = 'Vercel'), '2000000', 'y octubre conserva el monto anterior');
select is(jsonb_array_length(public.admin_finance_month('2026-11-15')->'recurring'), 1, 'un gasto fijo que empieza en diciembre no aparece en noviembre');
select is(public.admin_finance_month('2026-11-15')->>'tickets_fees',
  (select coalesce(sum(service_fee_amount), 0)::text from public.orders where status = 'paid' and not is_courtesy and created_at >= '2026-11-01 00:00-03' and created_at < '2026-12-01 00:00-03'), 'el cargo de entradas del mes coincide con las órdenes pagadas');

select * from finish();
rollback;
