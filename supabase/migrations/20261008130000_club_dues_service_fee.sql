-- Cargo de servicio en las cuotas de socios (acuerdo con cada club).
-- La familia paga la cuota + un cargo de servicio (% de la cuota) y el club recibe la cuota completa:
-- ENPASS cubre los costos del cobro. El % se fija por club (0 = no se cobra cargo).

alter table public.organizations
  add column if not exists club_dues_fee_bps integer not null default 0 check (club_dues_fee_bps between 0 and 5000);

-- Cada intento de pago guarda lo que se cobró de más (cargo), el total y, al aprobarse, lo que cobró Mercado Pago
-- (para saber cuánto reintegrarle al club).
alter table public.membership_due_payments
  add column if not exists service_fee_amount bigint not null default 0,
  add column if not exists gross_amount bigint,
  add column if not exists processor_fee_amount bigint;
alter table public.division_due_payments
  add column if not exists service_fee_amount bigint not null default 0,
  add column if not exists gross_amount bigint,
  add column if not exists processor_fee_amount bigint;

-- Solo la cuenta ENPASS (platform admin) define el cargo de cada club.
create or replace function public.set_club_dues_fee(target_org uuid, target_bps integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_bps is null or target_bps < 0 or target_bps > 5000 then
    raise exception 'INVALID_FEE' using errcode = 'P0001';
  end if;
  update public.organizations set club_dues_fee_bps = target_bps where id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.dues_fee.updated', 'organization', target_org);
end;
$$;
revoke all on function public.set_club_dues_fee(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_club_dues_fee(uuid, integer) to authenticated;

-- Listado para ENPASS: cada club con su % y los totales cobrados online (cargo de servicio y comisión de Mercado Pago a reintegrar).
create or replace function public.admin_list_clubs()
returns table (organization_id uuid, name text, slug text, fee_bps integer, collected_amount bigint, service_fee_amount bigint, processor_fee_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.name, o.slug, o.club_dues_fee_bps,
    coalesce(p.collected, 0)::bigint, coalesce(p.fee, 0)::bigint, coalesce(p.processor, 0)::bigint
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id and cs.enabled = true
  left join lateral (
    select sum(x.gross) as collected, sum(x.service_fee) as fee, sum(x.processor) as processor from (
      select mp.gross_amount as gross, mp.service_fee_amount as service_fee, mp.processor_fee_amount as processor
        from public.membership_due_payments mp where mp.organization_id = o.id and mp.status = 'approved'
      union all
      select dp.gross_amount, dp.service_fee_amount, dp.processor_fee_amount
        from public.division_due_payments dp where dp.organization_id = o.id and dp.status = 'approved'
    ) x
  ) p on true
  order by o.name;
end;
$$;
revoke all on function public.admin_list_clubs() from public, anon, authenticated;
grant execute on function public.admin_list_clubs() to authenticated;

notify pgrst, 'reload schema';
