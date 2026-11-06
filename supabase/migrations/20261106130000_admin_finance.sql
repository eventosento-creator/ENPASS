-- Caja de ENPASS: gastos de la plataforma y resultado del mes. Solo la cuenta de administrador de plataforma ve y toca estas tablas
-- (ningún club ni productor, ni siquiera por API); los montos van en centavos como el resto de la plata del sistema.

create table public.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  concept text not null check (length(btrim(concept)) between 1 and 120),
  category text not null check (category in ('infraestructura', 'mail', 'contador', 'publicidad', 'sueldos', 'impuestos', 'otros')),
  amount_cents bigint not null check (amount_cents > 0),
  kind text not null default 'variable' check (kind in ('fijo', 'variable')),
  notes text check (notes is null or length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index platform_expenses_date_idx on public.platform_expenses (expense_date desc);

-- Gastos fijos que se repiten todos los meses. No se generan filas por mes: el mes se arma leyendo los que estuvieron vigentes.
-- Un cambio de monto cierra el anterior (ends_on) y abre uno nuevo, así el historial de meses pasados no se mueve.
create table public.platform_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  concept text not null check (length(btrim(concept)) between 1 and 120),
  category text not null check (category in ('infraestructura', 'mail', 'contador', 'publicidad', 'sueldos', 'impuestos', 'otros')),
  amount_cents bigint not null check (amount_cents > 0),
  starts_on date not null,
  ends_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

alter table public.platform_expenses enable row level security;
alter table public.platform_recurring_expenses enable row level security;
revoke all on table public.platform_expenses, public.platform_recurring_expenses from anon, authenticated;
grant select, insert, update, delete on public.platform_expenses, public.platform_recurring_expenses to authenticated;
create policy platform_expenses_admin_all on public.platform_expenses for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_recurring_expenses_admin_all on public.platform_recurring_expenses for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Resultado de un mes (hora de Argentina). Ingresos con los mismos criterios que el Resumen:
--  * cargo de entradas: órdenes pagadas, sin cortesías;
--  * cargo de cuotas de clubes: si cobra el club, ENPASS se queda con el cargo menos la comisión de Mercado Pago que absorbe; si cobra ENPASS, el cargo entero
--    y la comisión real de Mercado Pago de esos pagos es un costo de ENPASS (mp_cost_enpass).
-- avg_fee_per_ticket (últimos 90 días hasta el fin del mes) sirve para el punto de equilibrio.
create function public.admin_finance_month(target_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  first_day date := date_trunc('month', target_month)::date;
  last_day date := (date_trunc('month', target_month) + interval '1 month - 1 day')::date;
  range_from timestamptz := first_day::timestamp at time zone 'America/Argentina/Buenos_Aires';
  range_to timestamptz := (last_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'tickets_fees', (select coalesce(sum(o.service_fee_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= range_from and o.created_at < range_to),
    'tickets_count', (select count(*) from public.tickets t where t.status = 'valid' and t.issued_at >= range_from and t.issued_at < range_to),
    'dues_fees', (select coalesce(sum(case when p.collected_by = 'club' then p.service_fee_amount - p.absorbed_fee_amount else p.service_fee_amount end), 0)
      from (select collected_by, service_fee_amount, absorbed_fee_amount, status, updated_at from public.membership_due_payments
            union all select collected_by, service_fee_amount, absorbed_fee_amount, status, updated_at from public.division_due_payments) p
      where p.status = 'approved' and p.updated_at >= range_from and p.updated_at < range_to),
    'mp_cost_enpass', (select coalesce(sum(coalesce(p.processor_fee_amount, 0)), 0)
      from (select collected_by, processor_fee_amount, status, updated_at from public.membership_due_payments
            union all select collected_by, processor_fee_amount, status, updated_at from public.division_due_payments) p
      where p.collected_by = 'enpass' and p.status = 'approved' and p.updated_at >= range_from and p.updated_at < range_to),
    'avg_fee_per_ticket', (select case when t.n = 0 then null else round(f.total::numeric / t.n)::bigint end
      from (select coalesce(sum(o.service_fee_amount), 0) as total from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= range_to - interval '90 days' and o.created_at < range_to) f,
           (select count(*) as n from public.tickets t where t.status = 'valid' and t.issued_at >= range_to - interval '90 days' and t.issued_at < range_to) t),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'expense_date', x.expense_date, 'concept', x.concept, 'category', x.category,
        'amount_cents', x.amount_cents, 'kind', x.kind, 'notes', x.notes) order by x.expense_date desc, x.created_at desc)
      from public.platform_expenses x where x.expense_date between first_day and last_day), '[]'::jsonb),
    'recurring', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'concept', r.concept, 'category', r.category, 'amount_cents', r.amount_cents,
        'starts_on', r.starts_on, 'ends_on', r.ends_on) order by r.concept)
      from public.platform_recurring_expenses r where r.starts_on <= last_day and (r.ends_on is null or r.ends_on >= first_day)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_finance_month(date) from public, anon, authenticated;
grant execute on function public.admin_finance_month(date) to authenticated;
