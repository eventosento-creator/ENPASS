-- Reportes del club: socios, cuotas (cobrado, pendiente, vencido), recaudación mensual, divisiones, deudores e ingresos.
-- Todo se calcula acá y solo lo puede leer quien gestiona el club (dueño/admin o colaborador).
-- Fechas en hora de Argentina (UTC-3). Una cuota cuenta como "cobrada" en la fecha de su pago (paid_at).

create or replace function public.get_club_report(target_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  d_from date; d_to date; today date; result jsonb;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_to <= p_from or p_to - p_from > interval '800 days' then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;
  d_from := (p_from at time zone tz)::date;
  d_to := (p_to at time zone tz)::date;   -- exclusivo
  today := (now() at time zone tz)::date;

  with all_dues as (
    select 'club'::text as kind, d.membership_id, null::uuid as division_id, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method
    from public.membership_dues d where d.organization_id = target_org and d.amount > 0
    union all
    select 'division'::text, e.membership_id, e.division_id, dd.amount, dd.due_date, dd.paid_at, dd.paid_amount, dd.payment_method
    from public.division_dues dd join public.membership_division_enrollments e on e.id = dd.enrollment_id
    where dd.organization_id = target_org and dd.amount > 0
  ),
  months as (
    select (date_trunc('month', (p_to - interval '1 second') at time zone tz) - (g * interval '1 month'))::date as month_start
    from generate_series(5, 0, -1) g
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', d_from, 'to', d_to),
    'members', jsonb_build_object(
      'active', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'active'),
      'suspended', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'suspended'),
      'cancelled', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'cancelled'),
      'new_in_period', (select count(*) from public.memberships m where m.organization_id = target_org and m.created_at >= p_from and m.created_at < p_to),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'monthly_fee', c.monthly_fee_amount, 'active_members',
          (select count(*) from public.memberships m where m.membership_category_id = c.id and m.status = 'active')) order by c.sort_order, c.name)
        from public.membership_categories c where c.organization_id = target_org and c.active), '[]'::jsonb)
    ),
    'dues', jsonb_build_object(
      'issued', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.due_date >= d_from and x.due_date < d_to),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.due_date >= d_from and x.due_date < d_to)),
      'collected', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to),
        'amount', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to),
        'online_amount', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to and x.payment_method = 'mercado_pago')),
      'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', t.method, 'count', t.cnt, 'amount', t.total))
        from (select coalesce(x.payment_method, 'other') as method, count(*) as cnt, sum(coalesce(x.paid_amount, x.amount)) as total
              from all_dues x where x.paid_at >= p_from and x.paid_at < p_to group by 1) t), '[]'::jsonb),
      'pending', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at is null and x.due_date >= today),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.paid_at is null and x.due_date >= today)),
      'overdue', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at is null and x.due_date < today),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.paid_at is null and x.due_date < today),
        'members', (select count(distinct x.membership_id) from all_dues x where x.paid_at is null and x.due_date < today)),
      'monthly', (select jsonb_agg(jsonb_build_object('month', to_char(mo.month_start, 'YYYY-MM'),
          'collected', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x
            where (x.paid_at at time zone tz)::date >= mo.month_start and (x.paid_at at time zone tz)::date < (mo.month_start + interval '1 month')::date)) order by mo.month_start)
        from months mo)
    ),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('name', dv.name, 'category', mc.name, 'monthly_fee', dv.monthly_fee_amount,
        'enrolled', (select count(*) from public.membership_division_enrollments e where e.division_id = dv.id and e.status = 'active'),
        'collected', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.division_id = dv.id and x.paid_at >= p_from and x.paid_at < p_to),
        'overdue', (select coalesce(sum(x.amount), 0) from all_dues x where x.division_id = dv.id and x.paid_at is null and x.due_date < today)) order by dv.sort_order, dv.name)
      from public.divisions dv left join public.membership_categories mc on mc.id = dv.membership_category_id
      where dv.organization_id = target_org and dv.active), '[]'::jsonb),
    'debtors', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'member_number', t.member_number, 'amount', t.total, 'dues', t.cnt, 'oldest_due', t.oldest) order by t.total desc)
      from (select c.first_name || ' ' || c.last_name as name, m.member_number, sum(x.amount) as total, count(*) as cnt, min(x.due_date) as oldest
            from all_dues x join public.memberships m on m.id = x.membership_id join public.customers c on c.id = m.customer_id
            where x.paid_at is null and x.due_date < today group by c.first_name, c.last_name, m.member_number order by 3 desc limit 10) t), '[]'::jsonb),
    'access', jsonb_build_object(
      'total', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to),
      'allowed', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result in ('allowed', 'allowed_with_debt')),
      'with_debt', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result = 'allowed_with_debt'),
      'denied', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result like 'denied%')
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_club_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_club_report(uuid, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
