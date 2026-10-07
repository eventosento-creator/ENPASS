-- Modalidad "ENPASS cobra" para cuotas de clubes: el pago entra a la cuenta de ENPASS (cuota + cargo de servicio)
-- y ENPASS le entrega al club la cuota completa en una liquidación mensual. ENPASS cubre la comisión de Mercado Pago.
-- La entrega hoy se registra a mano; queda preparada para la transferencia automática (BIND): ver method / provider_transfer_id.

-- 1) Modalidad por club (la define ENPASS). Por defecto sigue el modo anterior (cobra la cuenta del club).
alter table public.organizations
  add column if not exists club_collection_mode text not null default 'club_account'
  check (club_collection_mode in ('club_account', 'enpass'));

-- 2) Datos del club para recibir las liquidaciones.
alter table public.club_settings
  add column if not exists payout_holder text check (payout_holder is null or char_length(payout_holder) <= 120),
  add column if not exists payout_cuit text check (payout_cuit is null or payout_cuit ~ '^[0-9]{11}$'),
  add column if not exists payout_alias text check (payout_alias is null or payout_alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  add column if not exists payout_cbu text check (payout_cbu is null or payout_cbu ~ '^[0-9]{22}$');

create or replace function public.set_club_payout_details(target_org uuid, target_holder text, target_cuit text, target_alias text, target_cbu text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.club_settings (organization_id, payout_holder, payout_cuit, payout_alias, payout_cbu)
  values (target_org, nullif(trim(coalesce(target_holder, '')), ''), nullif(regexp_replace(coalesce(target_cuit, ''), '[^0-9]', '', 'g'), ''),
    nullif(trim(coalesce(target_alias, '')), ''), nullif(regexp_replace(coalesce(target_cbu, ''), '[^0-9]', '', 'g'), ''))
  on conflict (organization_id) do update set
    payout_holder = nullif(trim(coalesce(target_holder, '')), ''),
    payout_cuit = nullif(regexp_replace(coalesce(target_cuit, ''), '[^0-9]', '', 'g'), ''),
    payout_alias = nullif(trim(coalesce(target_alias, '')), ''),
    payout_cbu = nullif(regexp_replace(coalesce(target_cbu, ''), '[^0-9]', '', 'g'), '');
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.payout_details.updated', 'organization', target_org);
end;
$$;
revoke all on function public.set_club_payout_details(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_club_payout_details(uuid, text, text, text, text) to authenticated;

-- 3) Los pagos cobrados por ENPASS no tienen cuenta de Mercado Pago del club.
alter table public.membership_due_payments alter column payment_account_id drop not null;
alter table public.division_due_payments alter column payment_account_id drop not null;
alter table public.membership_due_payments add column if not exists collected_by text not null default 'club' check (collected_by in ('club', 'enpass'));
alter table public.division_due_payments add column if not exists collected_by text not null default 'club' check (collected_by in ('club', 'enpass'));

-- 4) Liquidaciones: lo que ENPASS le entrega al club (la cuota completa de los pagos que cobró).
create table if not exists public.club_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_to date not null,
  payments_count integer not null check (payments_count > 0),
  amount bigint not null check (amount > 0),              -- lo que se le entrega al club (suma de cuotas)
  service_fee_amount bigint not null default 0,           -- cargo de servicio cobrado a las familias (ingreso de ENPASS)
  processor_fee_amount bigint not null default 0,         -- comisión de Mercado Pago (la cubre ENPASS)
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  method text check (method in ('manual', 'bind')),
  reference text,                                         -- comprobante / id de transferencia
  provider_transfer_id text,                              -- reservado para la transferencia automática (BIND)
  destination_snapshot jsonb not null default '{}'::jsonb, -- titular/CUIT/alias/CBU al momento de liquidar
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists club_payouts_org_idx on public.club_payouts(organization_id, created_at desc);
alter table public.club_payouts enable row level security;
drop policy if exists club_payouts_club_select on public.club_payouts;
create policy club_payouts_club_select on public.club_payouts for select to authenticated
  using ((select public.can_manage_club(organization_id)));
grant select on public.club_payouts to authenticated;

alter table public.membership_due_payments add column if not exists payout_id uuid references public.club_payouts(id) on delete set null;
alter table public.division_due_payments add column if not exists payout_id uuid references public.club_payouts(id) on delete set null;

-- 5) Panel ENPASS: modalidad por club.
create or replace function public.set_club_collection_mode(target_org uuid, target_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_mode not in ('club_account', 'enpass') then
    raise exception 'INVALID_MODE' using errcode = 'P0001';
  end if;
  update public.organizations set club_collection_mode = target_mode where id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.collection_mode.updated', 'organization', target_org);
end;
$$;
revoke all on function public.set_club_collection_mode(uuid, text) from public, anon, authenticated;
grant execute on function public.set_club_collection_mode(uuid, text) to authenticated;

-- 6) Pendiente de liquidar por club (pagos aprobados cobrados por ENPASS y todavía sin liquidación).
create or replace function public.admin_club_settlement_summary()
returns table (organization_id uuid, name text, collection_mode text, fee_bps integer, payments_count bigint, owed_amount bigint, service_fee_amount bigint, processor_fee_amount bigint, has_payout_details boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.name, o.club_collection_mode, o.club_dues_fee_bps,
    coalesce(p.cnt, 0)::bigint, coalesce(p.owed, 0)::bigint, coalesce(p.fee, 0)::bigint, coalesce(p.proc, 0)::bigint,
    (cs.payout_alias is not null or cs.payout_cbu is not null)
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id and cs.enabled = true
  left join lateral (
    select count(*) as cnt, sum(x.gross - x.fee) as owed, sum(x.fee) as fee, sum(coalesce(x.proc, 0)) as proc from (
      select mp.gross_amount as gross, mp.service_fee_amount as fee, mp.processor_fee_amount as proc
        from public.membership_due_payments mp where mp.organization_id = o.id and mp.status = 'approved' and mp.collected_by = 'enpass' and mp.payout_id is null and mp.gross_amount is not null
      union all
      select dp.gross_amount, dp.service_fee_amount, dp.processor_fee_amount
        from public.division_due_payments dp where dp.organization_id = o.id and dp.status = 'approved' and dp.collected_by = 'enpass' and dp.payout_id is null and dp.gross_amount is not null
    ) x
  ) p on true
  order by o.name;
end;
$$;
revoke all on function public.admin_club_settlement_summary() from public, anon, authenticated;
grant execute on function public.admin_club_settlement_summary() to authenticated;

-- 7) Genera la liquidación: junta todos los pagos pendientes hasta la fecha y los marca como liquidados.
create or replace function public.create_club_payout(target_org uuid, target_up_to timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_payout_id uuid; owed bigint; fee bigint; proc bigint; cnt integer; details jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select count(*), coalesce(sum(x.gross - x.fee), 0), coalesce(sum(x.fee), 0), coalesce(sum(coalesce(x.proc, 0)), 0) into cnt, owed, fee, proc from (
    select mp.gross_amount as gross, mp.service_fee_amount as fee, mp.processor_fee_amount as proc
      from public.membership_due_payments mp where mp.organization_id = target_org and mp.status = 'approved' and mp.collected_by = 'enpass' and mp.payout_id is null and mp.gross_amount is not null and mp.updated_at <= target_up_to
    union all
    select dp.gross_amount, dp.service_fee_amount, dp.processor_fee_amount
      from public.division_due_payments dp where dp.organization_id = target_org and dp.status = 'approved' and dp.collected_by = 'enpass' and dp.payout_id is null and dp.gross_amount is not null and dp.updated_at <= target_up_to
  ) x;
  if cnt = 0 or owed <= 0 then raise exception 'NOTHING_TO_SETTLE' using errcode = 'P0001'; end if;
  select jsonb_build_object('holder', cs.payout_holder, 'cuit', cs.payout_cuit, 'alias', cs.payout_alias, 'cbu', cs.payout_cbu) into details
  from public.club_settings cs where cs.organization_id = target_org;
  insert into public.club_payouts (organization_id, period_to, payments_count, amount, service_fee_amount, processor_fee_amount, destination_snapshot, created_by)
  values (target_org, (target_up_to at time zone 'America/Argentina/Buenos_Aires')::date, cnt, owed, fee, proc, coalesce(details, '{}'::jsonb), auth.uid())
  returning id into new_payout_id;
  update public.membership_due_payments set payout_id = new_payout_id
    where organization_id = target_org and status = 'approved' and collected_by = 'enpass' and payout_id is null and gross_amount is not null and updated_at <= target_up_to;
  update public.division_due_payments set payout_id = new_payout_id
    where organization_id = target_org and status = 'approved' and collected_by = 'enpass' and payout_id is null and gross_amount is not null and updated_at <= target_up_to;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.payout.created', 'club_payout', new_payout_id);
  return new_payout_id;
end;
$$;
revoke all on function public.create_club_payout(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.create_club_payout(uuid, timestamptz) to authenticated;

-- 8) Registrar la entrega (hoy a mano; la transferencia automática la marcará con method = 'bind').
create or replace function public.mark_club_payout_paid(target_payout uuid, target_method text, target_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_method not in ('manual', 'bind') then raise exception 'INVALID_METHOD' using errcode = 'P0001'; end if;
  update public.club_payouts set status = 'paid', method = target_method, reference = nullif(trim(coalesce(target_reference, '')), ''), paid_at = now()
  where id = target_payout and status = 'pending' returning organization_id into org;
  if org is null then raise exception 'PAYOUT_NOT_PENDING' using errcode = 'P0001'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (org, auth.uid(), 'club.payout.paid', 'club_payout', target_payout);
end;
$$;
revoke all on function public.mark_club_payout_paid(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_club_payout_paid(uuid, text, text) to authenticated;

-- Cancelar una liquidación pendiente (libera sus pagos para liquidarlos de nuevo).
create or replace function public.cancel_club_payout(target_payout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select organization_id into org from public.club_payouts where id = target_payout and status = 'pending';
  if org is null then raise exception 'PAYOUT_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.membership_due_payments set payout_id = null where payout_id = target_payout;
  update public.division_due_payments set payout_id = null where payout_id = target_payout;
  delete from public.club_payouts where id = target_payout;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (org, auth.uid(), 'club.payout.cancelled', 'club_payout', target_payout);
end;
$$;
revoke all on function public.cancel_club_payout(uuid) from public, anon, authenticated;
grant execute on function public.cancel_club_payout(uuid) to authenticated;

-- 9) Lo que ve el club: liquidaciones y saldo pendiente (solo si cobra ENPASS).
create or replace function public.get_club_settlements(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare mode text; pending_owed bigint; pending_count bigint; payouts jsonb;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select club_collection_mode into mode from public.organizations where id = target_org;
  select coalesce(sum(x.gross - x.fee), 0), count(*) into pending_owed, pending_count from (
    select mp.gross_amount as gross, mp.service_fee_amount as fee from public.membership_due_payments mp
      where mp.organization_id = target_org and mp.status = 'approved' and mp.collected_by = 'enpass' and mp.payout_id is null and mp.gross_amount is not null
    union all
    select dp.gross_amount, dp.service_fee_amount from public.division_due_payments dp
      where dp.organization_id = target_org and dp.status = 'approved' and dp.collected_by = 'enpass' and dp.payout_id is null and dp.gross_amount is not null
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'created_at', p.created_at, 'paid_at', p.paid_at, 'status', p.status, 'amount', p.amount, 'payments', p.payments_count, 'reference', p.reference, 'method', p.method) order by p.created_at desc), '[]'::jsonb)
    into payouts from (select * from public.club_payouts where organization_id = target_org order by created_at desc limit 24) p;
  return jsonb_build_object('mode', mode, 'pending_amount', pending_owed, 'pending_payments', pending_count, 'payouts', payouts);
end;
$$;
revoke all on function public.get_club_settlements(uuid) from public, anon, authenticated;
grant execute on function public.get_club_settlements(uuid) to authenticated;

notify pgrst, 'reload schema';
