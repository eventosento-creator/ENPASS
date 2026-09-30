-- Cobro online (Mercado Pago) para cuotas de división — mismo patrón que
-- 20260928150000_membership_due_online_payment.sql, pero para division_dues en vez de
-- membership_dues (tablas separadas, por eso el camino de pago es paralelo, no compartido).

create table public.division_due_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  due_id uuid not null references public.division_dues(id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  provider text not null default 'mercado_pago' check (provider in ('mercado_pago')),
  provider_preference_id text,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index division_due_payments_due_idx on public.division_due_payments(due_id);

alter table public.division_due_payments enable row level security;
create policy division_due_payments_select on public.division_due_payments for select to authenticated
  using ((select public.can_manage_club(organization_id)));

grant select on public.division_due_payments to authenticated;
grant insert, update on public.division_due_payments to service_role;
grant update on public.division_dues to service_role;

create function public.get_division_due_public_status(target_due uuid)
returns table (
  organization_name text, member_first_name text, division_name text, period date, amount bigint, currency text,
  status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select o.name, c.first_name, dv.name, d.period, d.amount, o.default_currency,
    case when d.paid_at is not null then 'paid' else 'pending' end
  from public.division_dues d
  join public.membership_division_enrollments e on e.id = d.enrollment_id
  join public.memberships m on m.id = e.membership_id
  join public.customers c on c.id = m.customer_id
  join public.divisions dv on dv.id = e.division_id
  join public.organizations o on o.id = d.organization_id
  where d.id = target_due;
end;
$$;
revoke all on function public.get_division_due_public_status(uuid) from public;
grant execute on function public.get_division_due_public_status(uuid) to anon, authenticated;
