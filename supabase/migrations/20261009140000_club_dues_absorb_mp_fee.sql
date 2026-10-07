-- Cuotas cobradas en la cuenta de Mercado Pago del club (modalidad "el club cobra"):
-- ENPASS absorbe la comisión de Mercado Pago restándola de su propio cargo, así el club recibe ≈ la cuota completa.
-- club_dues_mp_fee_bps = estimación de esa comisión (en % del total cobrado, en puntos base). 0 = no se absorbe nada.
-- Se guarda lo absorbido y la comisión real de cada pago para poder ajustar la diferencia con el club.

alter table public.organizations
  add column if not exists club_dues_mp_fee_bps integer not null default 0 check (club_dues_mp_fee_bps between 0 and 2000);

alter table public.membership_due_payments add column if not exists absorbed_fee_amount bigint not null default 0;
alter table public.division_due_payments add column if not exists absorbed_fee_amount bigint not null default 0;

create or replace function public.set_club_dues_mp_fee(target_org uuid, target_bps integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_bps is null or target_bps < 0 or target_bps > 2000 then
    raise exception 'INVALID_FEE' using errcode = 'P0001';
  end if;
  update public.organizations set club_dues_mp_fee_bps = target_bps where id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.dues_mp_fee.updated', 'organization', target_org);
end;
$$;
revoke all on function public.set_club_dues_mp_fee(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_club_dues_mp_fee(uuid, integer) to authenticated;

-- Listado de ENPASS: ahora con la comisión estimada que se absorbe y, de los pagos aprobados, lo absorbido vs. lo que cobró realmente Mercado Pago.
drop function if exists public.admin_list_clubs();
create or replace function public.admin_list_clubs()
returns table (organization_id uuid, name text, slug text, fee_bps integer, mp_absorb_bps integer, collected_amount bigint, service_fee_amount bigint, processor_fee_amount bigint, absorbed_fee_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.name, o.slug, o.club_dues_fee_bps, o.club_dues_mp_fee_bps,
    coalesce(p.collected, 0)::bigint, coalesce(p.fee, 0)::bigint, coalesce(p.processor, 0)::bigint, coalesce(p.absorbed, 0)::bigint
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id and cs.enabled = true
  left join lateral (
    select sum(x.gross) as collected, sum(x.service_fee) as fee, sum(x.processor) as processor, sum(x.absorbed) as absorbed from (
      select mp.gross_amount as gross, mp.service_fee_amount as service_fee, mp.processor_fee_amount as processor, mp.absorbed_fee_amount as absorbed
        from public.membership_due_payments mp where mp.organization_id = o.id and mp.status = 'approved' and mp.collected_by = 'club'
      union all
      select dp.gross_amount, dp.service_fee_amount, dp.processor_fee_amount, dp.absorbed_fee_amount
        from public.division_due_payments dp where dp.organization_id = o.id and dp.status = 'approved' and dp.collected_by = 'club'
    ) x
  ) p on true
  order by o.name;
end;
$$;
revoke all on function public.admin_list_clubs() from public, anon, authenticated;
grant execute on function public.admin_list_clubs() to authenticated;

notify pgrst, 'reload schema';
