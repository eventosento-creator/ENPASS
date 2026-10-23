-- Admin: ventas día por día (gráfico del Resumen) y resumen diario de pendientes para el mail de ENPASS.

-- Ventas por día en hora de Argentina. Mismos criterios que admin_overview: órdenes pagadas, sin cortesías;
-- "ventas" = precio base, "cargo" = ingreso de ENPASS (siempre separados).
create or replace function public.admin_sales_by_day(target_from timestamptz, target_to timestamptz)
returns table (day date, sales_amount bigint, fee_amount bigint, orders_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select d.day::date,
    coalesce(sum(o.subtotal_amount), 0)::bigint,
    coalesce(sum(o.service_fee_amount), 0)::bigint,
    count(o.id)
  from generate_series((target_from at time zone 'America/Argentina/Buenos_Aires')::date, ((target_to - interval '1 second') at time zone 'America/Argentina/Buenos_Aires')::date, interval '1 day') as d(day)
  left join public.orders o on o.status = 'paid' and not o.is_courtesy
    and o.created_at >= target_from and o.created_at < target_to
    and (o.created_at at time zone 'America/Argentina/Buenos_Aires')::date = d.day::date
  group by d.day
  order by d.day;
end;
$$;

-- Pendientes para el mail diario. Solo el servidor (cron) puede llamarla: no depende de una sesión de admin.
create or replace function public.admin_pending_digest()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'transfers_review', (select count(*) from public.payments p where p.provider = 'manual' and p.method = 'bank_transfer' and p.status = 'processing' and p.transfer_proof_path is not null),
    'oldest_transfer_hours', (select coalesce(round(extract(epoch from (now() - min(p.transfer_proof_uploaded_at))) / 3600), 0) from public.payments p where p.provider = 'manual' and p.method = 'bank_transfer' and p.status = 'processing' and p.transfer_proof_path is not null),
    'listings_pending', (select count(*) from public.club_settings c where c.public_listing_status = 'pending'),
    'payouts_to_pay', (select count(*) from public.transfer_payouts tp where tp.status = 'pending') + (select count(*) from public.club_payouts cp where cp.status = 'pending'),
    'payouts_ready', (select count(distinct org.id) from public.organizations org cross join lateral public.transfer_sales(org.id) s where s.payout_id is null and s.event_ended),
    'conflicts', (select count(*) from public.payments p where p.status in ('approved_inventory_conflict', 'approved_duplicate_charge') or p.requires_action),
    'owed_total', (select coalesce(sum(s.subtotal_amount), 0) from public.organizations org cross join lateral public.transfer_sales(org.id) s where s.payout_id is null or s.payout_status = 'pending'),
    'sales_yesterday', (select coalesce(sum(o.subtotal_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy
      and (o.created_at at time zone 'America/Argentina/Buenos_Aires')::date = ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 1)),
    'fees_yesterday', (select coalesce(sum(o.service_fee_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy
      and (o.created_at at time zone 'America/Argentina/Buenos_Aires')::date = ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 1))
  );
$$;

revoke all on function public.admin_sales_by_day(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_pending_digest() from public, anon, authenticated;
grant execute on function public.admin_sales_by_day(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_pending_digest() to service_role;

notify pgrst, 'reload schema';
