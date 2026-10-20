-- Etapa 2 del pago por transferencia: liquidaciones de ENPASS a los productores.
-- Lo cobrado por transferencia (precio base de cada entrada; el cargo de servicio es de ENPASS) queda en poder de ENPASS
-- hasta que se le liquida al productor. "Saldo a liquidar" = ventas por transferencia aprobadas que todavía no están
-- en ninguna liquidación. Por defecto solo se liquidan eventos que ya terminaron (ENPASS puede incluir los próximos).
-- Las ventas cobradas con Mercado Pago NO entran acá: esa plata ya está en la cuenta del productor.

-- 1) Datos del productor para recibir liquidaciones (los carga él en Ajustes).
create table if not exists public.organization_payout_details (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  holder text check (holder is null or char_length(holder) <= 120),
  cuit text check (cuit is null or cuit ~ '^[0-9]{11}$'),
  alias text check (alias is null or alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  cbu text check (cbu is null or cbu ~ '^[0-9]{22}$'),
  updated_at timestamptz not null default now()
);
alter table public.organization_payout_details enable row level security;
drop policy if exists organization_payout_details_select on public.organization_payout_details;
create policy organization_payout_details_select on public.organization_payout_details for select to authenticated
  using ((select public.can_manage_org(organization_id)));
grant select on public.organization_payout_details to authenticated;

create or replace function public.set_org_payout_details(target_org uuid, target_holder text, target_cuit text, target_alias text, target_cbu text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean_alias text := nullif(trim(coalesce(target_alias, '')), '');
  clean_cbu text := nullif(regexp_replace(coalesce(target_cbu, ''), '[^0-9]', '', 'g'), '');
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  if clean_alias is null and clean_cbu is null then raise exception 'ALIAS_OR_CBU_REQUIRED' using errcode = 'P0001'; end if;
  insert into public.organization_payout_details (organization_id, holder, cuit, alias, cbu)
  values (target_org, nullif(trim(coalesce(target_holder, '')), ''), nullif(regexp_replace(coalesce(target_cuit, ''), '[^0-9]', '', 'g'), ''), clean_alias, clean_cbu)
  on conflict (organization_id) do update set holder = excluded.holder, cuit = excluded.cuit, alias = excluded.alias, cbu = excluded.cbu, updated_at = now();
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'org.payout_details.updated', 'organization', target_org);
end;
$$;

-- 2) Liquidaciones.
create table if not exists public.transfer_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  orders_count integer not null check (orders_count > 0),
  amount bigint not null check (amount > 0),               -- lo que se le entrega al productor (suma del precio base de las entradas)
  currency char(3) not null default 'ARS',
  includes_upcoming boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  method text check (method in ('manual', 'bind')),
  reference text check (reference is null or char_length(reference) <= 200),   -- comprobante / id de la transferencia que hizo ENPASS
  provider_transfer_id text,                                -- reservado para la transferencia automática (BIND)
  destination_snapshot jsonb not null default '{}'::jsonb,  -- titular/CUIT/alias/CBU al momento de liquidar
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists transfer_payouts_org_idx on public.transfer_payouts(organization_id, created_at desc);
alter table public.transfer_payouts enable row level security;
drop policy if exists transfer_payouts_select on public.transfer_payouts;
create policy transfer_payouts_select on public.transfer_payouts for select to authenticated
  using ((select public.can_manage_org(organization_id)));
grant select on public.transfer_payouts to authenticated;

alter table public.payments add column if not exists transfer_payout_id uuid references public.transfer_payouts(id) on delete set null;
create index if not exists payments_transfer_payout_idx on public.payments(transfer_payout_id) where transfer_payout_id is not null;

-- 3) Ventas por transferencia de una organización (una fila por pago aprobado), con su situación de liquidación.
create or replace function public.transfer_sales(target_org uuid)
returns table (payment_id uuid, event_id uuid, event_name text, event_starts_at timestamptz, event_ended boolean,
  subtotal_amount bigint, payout_id uuid, payout_status text)
language sql stable security definer set search_path = '' as $$
  select p.id, e.id, e.name, e.starts_at, (coalesce(e.ends_at, e.starts_at + interval '12 hours') < now()),
    o.subtotal_amount, p.transfer_payout_id, tp.status
  from public.payments p
  join public.orders o on o.id = p.order_id
  join public.events e on e.id = o.event_id
  left join public.transfer_payouts tp on tp.id = p.transfer_payout_id
  where p.organization_id = target_org and p.provider = 'manual' and p.method = 'bank_transfer'
    and p.status = 'approved' and o.status = 'paid' and o.subtotal_amount > 0;
$$;
revoke all on function public.transfer_sales(uuid) from public, anon, authenticated;

-- 4) Saldo y detalle por evento (productor de la organización o ENPASS).
create or replace function public.get_transfer_balance(target_org uuid)
returns table (owed_amount bigint, owed_ready_amount bigint, owed_orders integer, pending_payout_amount bigint, paid_amount bigint, has_payout_details boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select coalesce(sum(s.subtotal_amount) filter (where s.payout_id is null), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_id is null and s.event_ended), 0)::bigint,
    (count(*) filter (where s.payout_id is null))::integer,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'pending'), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'paid'), 0)::bigint,
    exists (select 1 from public.organization_payout_details d where d.organization_id = target_org)
  from public.transfer_sales(target_org) s;
end;
$$;

create or replace function public.get_transfer_sales_by_event(target_org uuid)
returns table (event_id uuid, event_name text, event_starts_at timestamptz, event_ended boolean, orders_count integer,
  total_amount bigint, owed_amount bigint, pending_amount bigint, paid_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select s.event_id, s.event_name, s.event_starts_at, bool_or(s.event_ended), count(*)::integer, sum(s.subtotal_amount)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_id is null), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'pending'), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'paid'), 0)::bigint
  from public.transfer_sales(target_org) s
  group by s.event_id, s.event_name, s.event_starts_at
  order by s.event_starts_at desc;
end;
$$;

-- 5) Panel ENPASS: resumen de todas las organizaciones con ventas por transferencia.
create or replace function public.get_transfer_settlement_summary()
returns table (organization_id uuid, organization_name text, owed_amount bigint, owed_ready_amount bigint, owed_orders integer,
  pending_payout_amount bigint, paid_amount bigint, has_payout_details boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select org.id, org.name,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_id is null), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_id is null and s.event_ended), 0)::bigint,
    (count(*) filter (where s.payout_id is null))::integer,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'pending'), 0)::bigint,
    coalesce(sum(s.subtotal_amount) filter (where s.payout_status = 'paid'), 0)::bigint,
    exists (select 1 from public.organization_payout_details d where d.organization_id = org.id)
  from public.organizations org
  cross join lateral public.transfer_sales(org.id) s
  group by org.id, org.name
  order by 4 desc, org.name;
end;
$$;

-- 6) Crear la liquidación: junta las ventas pendientes (eventos terminados, o también los próximos si se pide).
create or replace function public.create_transfer_payout(target_org uuid, target_include_upcoming boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  details public.organization_payout_details;
  payout_row public.transfer_payouts;
  eligible_ids uuid[];
  total bigint;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into details from public.organization_payout_details where organization_id = target_org;
  if not found then raise exception 'PAYOUT_DETAILS_REQUIRED' using errcode = 'P0001'; end if;
  perform 1 from public.organizations where id = target_org for update;
  select array_agg(s.payment_id), coalesce(sum(s.subtotal_amount), 0)::bigint into eligible_ids, total
  from public.transfer_sales(target_org) s
  where s.payout_id is null and (target_include_upcoming or s.event_ended);
  if eligible_ids is null or total <= 0 then raise exception 'NOTHING_TO_SETTLE' using errcode = 'P0001'; end if;
  insert into public.transfer_payouts (organization_id, orders_count, amount, includes_upcoming, destination_snapshot, created_by)
  values (target_org, array_length(eligible_ids, 1), total, coalesce(target_include_upcoming, false),
    jsonb_build_object('holder', details.holder, 'cuit', details.cuit, 'alias', details.alias, 'cbu', details.cbu), auth.uid())
  returning * into payout_row;
  update public.payments set transfer_payout_id = payout_row.id where id = any(eligible_ids);
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'transfer.payout.created', 'transfer_payout', payout_row.id,
    jsonb_build_object('amount', total, 'orders', array_length(eligible_ids, 1), 'includes_upcoming', coalesce(target_include_upcoming, false)));
  return payout_row.id;
end;
$$;

-- 7) ENPASS hizo la transferencia al productor: se marca pagada y queda el asiento en el ledger.
create or replace function public.mark_transfer_payout_paid(target_payout uuid, target_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payout_row public.transfer_payouts;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into payout_row from public.transfer_payouts where id = target_payout for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0001'; end if;
  if payout_row.status <> 'pending' then raise exception 'PAYOUT_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.transfer_payouts set status = 'paid', method = 'manual', paid_at = now(),
    reference = nullif(trim(coalesce(target_reference, '')), '') where id = payout_row.id;
  insert into public.ledger_movements (organization_id, movement_type, amount, currency, description, metadata)
  values (payout_row.organization_id, 'payout', -payout_row.amount, payout_row.currency, 'Liquidación de ventas por transferencia',
    jsonb_build_object('payout_id', payout_row.id, 'collected_by', 'enpass', 'reference', nullif(trim(coalesce(target_reference, '')), '')));
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (payout_row.organization_id, auth.uid(), 'transfer.payout.paid', 'transfer_payout', payout_row.id, jsonb_build_object('amount', payout_row.amount));
end;
$$;

-- 8) Cancelar una liquidación pendiente (las ventas vuelven al saldo a liquidar).
create or replace function public.cancel_transfer_payout(target_payout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  payout_row public.transfer_payouts;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into payout_row from public.transfer_payouts where id = target_payout for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0001'; end if;
  if payout_row.status <> 'pending' then raise exception 'PAYOUT_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.payments set transfer_payout_id = null where transfer_payout_id = payout_row.id;
  update public.transfer_payouts set status = 'cancelled' where id = payout_row.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (payout_row.organization_id, auth.uid(), 'transfer.payout.cancelled', 'transfer_payout', payout_row.id);
end;
$$;

-- 9) Permisos.
revoke all on function public.set_org_payout_details(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_transfer_balance(uuid) from public, anon, authenticated;
revoke all on function public.get_transfer_sales_by_event(uuid) from public, anon, authenticated;
revoke all on function public.get_transfer_settlement_summary() from public, anon, authenticated;
revoke all on function public.create_transfer_payout(uuid, boolean) from public, anon, authenticated;
revoke all on function public.mark_transfer_payout_paid(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_transfer_payout(uuid) from public, anon, authenticated;
grant execute on function public.set_org_payout_details(uuid, text, text, text, text) to authenticated;
grant execute on function public.get_transfer_balance(uuid) to authenticated;
grant execute on function public.get_transfer_sales_by_event(uuid) to authenticated;
grant execute on function public.get_transfer_settlement_summary() to authenticated;
grant execute on function public.create_transfer_payout(uuid, boolean) to authenticated;
grant execute on function public.mark_transfer_payout_paid(uuid, text) to authenticated;
grant execute on function public.cancel_transfer_payout(uuid) to authenticated;

notify pgrst, 'reload schema';
