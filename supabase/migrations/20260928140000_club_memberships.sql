-- Clubes y socios: gestión de padrón, categorías de membresía y cuotas, dentro del mismo
-- espacio (organization) que ya usa el club para sus eventos. Opt-in por espacio vía
-- club_settings. No toca orders/tickets/payments: el cobro online de cuotas usa su propia
-- tabla (membership_due_payments) para no forzar invariantes de la ticketera (orders.event_id
-- es not null, así que una cuota -que no tiene evento- no puede modelarse como una orden).

create table public.club_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  debt_blocks_entry boolean not null default false, -- informativo en el MVP; no se usa todavía en check_in_ticket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  monthly_fee_amount bigint not null default 0 check (monthly_fee_amount >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  membership_category_id uuid not null references public.membership_categories(id) on delete restrict,
  member_number text not null check (char_length(member_number) between 1 and 20),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  status_reason text,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users(id),
  starts_at date not null default current_date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id),
  unique (organization_id, member_number)
);
create index memberships_org_status_idx on public.memberships(organization_id, status);

create table public.membership_dues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  period date not null,
  amount bigint not null check (amount >= 0),
  due_date date not null,
  paid_at timestamptz,
  paid_amount bigint check (paid_amount is null or paid_amount >= 0),
  payment_method text check (payment_method in ('cash', 'transfer', 'other', 'mercado_pago')),
  payment_reference text,
  registered_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (membership_id, period)
);
create index membership_dues_membership_idx on public.membership_dues(membership_id, period desc);
create index membership_dues_org_pending_idx on public.membership_dues(organization_id, due_date) where paid_at is null;

create table public.membership_due_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  due_id uuid not null references public.membership_dues(id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  provider text not null default 'mercado_pago' check (provider in ('mercado_pago')),
  provider_preference_id text,
  provider_payment_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index membership_due_payments_due_idx on public.membership_due_payments(due_id);

create table public.club_staff (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member_staff' check (role in ('member_staff')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.club_settings enable row level security;
alter table public.membership_categories enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_dues enable row level security;
alter table public.membership_due_payments enable row level security;
alter table public.club_staff enable row level security;

-- ---------------------------------------------------------------------------------------------
-- Autorización: can_manage_club = owner/admin de la organización, o club_staff de esa org.
-- ---------------------------------------------------------------------------------------------
create function public.can_manage_club(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_org(target_org)
    or exists (
      select 1 from public.club_staff s
      where s.organization_id = target_org and s.user_id = (select auth.uid())
    );
$$;
revoke all on function public.can_manage_club(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_club(uuid) to authenticated;

create policy club_settings_manage on public.club_settings for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_org(organization_id)));
create policy membership_categories_manage on public.membership_categories for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
create policy memberships_manage on public.memberships for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
create policy membership_dues_manage on public.membership_dues for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
create policy membership_due_payments_select on public.membership_due_payments for select to authenticated
  using ((select public.can_manage_club(organization_id)));
create policy club_staff_manage on public.club_staff for all to authenticated
  using ((select public.can_manage_org(organization_id))) with check ((select public.can_manage_org(organization_id)));

grant select, insert, update, delete on public.club_settings, public.membership_categories, public.memberships, public.membership_dues to authenticated;
grant select on public.membership_due_payments to authenticated;
grant select, insert, update, delete on public.club_staff to authenticated;
grant all on public.club_settings, public.membership_categories, public.memberships, public.membership_dues, public.membership_due_payments, public.club_staff to service_role;

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

create function public.set_club_enabled(target_org uuid, target_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.club_settings (organization_id, enabled)
  values (target_org, target_enabled)
  on conflict (organization_id) do update set enabled = target_enabled, updated_at = now();
end;
$$;
revoke all on function public.set_club_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_club_enabled(uuid, boolean) to authenticated;

create function public.add_club_staff(target_org uuid, target_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(trim(target_email));
  if target_user_id is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.club_staff (organization_id, user_id, created_by)
  values (target_org, target_user_id, auth.uid())
  on conflict (organization_id, user_id) do nothing;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club_staff.added', 'club_staff', target_user_id);
  return target_user_id;
end;
$$;
revoke all on function public.add_club_staff(uuid, text) from public, anon, authenticated;
grant execute on function public.add_club_staff(uuid, text) to authenticated;

create function public.remove_club_staff(target_org uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.club_staff where organization_id = target_org and user_id = target_user;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club_staff.removed', 'club_staff', target_user);
end;
$$;
revoke all on function public.remove_club_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_club_staff(uuid, uuid) to authenticated;

create function public.upsert_membership_category(
  target_org uuid, target_id uuid, target_name text, target_monthly_fee_amount bigint, target_active boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare category_id uuid;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 60 or target_monthly_fee_amount < 0 then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.membership_categories (organization_id, name, monthly_fee_amount, active)
    values (target_org, trim(target_name), target_monthly_fee_amount, coalesce(target_active, true))
    returning id into category_id;
  else
    update public.membership_categories
    set name = trim(target_name), monthly_fee_amount = target_monthly_fee_amount, active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org
    returning id into category_id;
    if category_id is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return category_id;
end;
$$;
revoke all on function public.upsert_membership_category(uuid, uuid, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.upsert_membership_category(uuid, uuid, text, bigint, boolean) to authenticated;

-- Busca un customer existente por email o documento dentro de la org (para no duplicar
-- personas que ya compraron algo alguna vez), y arma la fila de socio.
create function public.create_membership(
  target_org uuid,
  target_category uuid,
  target_member_number text,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_phone text,
  target_document text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  customer_id uuid;
  membership_id uuid;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_categories c where c.id = target_category and c.organization_id = target_org) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(target_member_number, ''))) < 1 or char_length(trim(coalesce(target_first_name, ''))) < 1
    or char_length(trim(coalesce(target_last_name, ''))) < 1 or target_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_MEMBER_DATA' using errcode = 'P0001';
  end if;

  select id into customer_id from public.customers
  where organization_id = target_org and lower(email) = lower(trim(target_email));

  if customer_id is null and target_document is not null and trim(target_document) <> '' then
    select id into customer_id from public.customers
    where organization_id = target_org and document = trim(target_document)
    limit 1;
  end if;

  if customer_id is null then
    insert into public.customers (organization_id, first_name, last_name, email, phone, document)
    values (target_org, trim(target_first_name), trim(target_last_name), lower(trim(target_email)), nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''))
    returning id into customer_id;
  else
    update public.customers set
      first_name = trim(target_first_name), last_name = trim(target_last_name),
      phone = coalesce(nullif(trim(coalesce(target_phone, '')), ''), phone),
      document = coalesce(nullif(trim(coalesce(target_document, '')), ''), document)
    where id = customer_id;
  end if;

  insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by)
  values (target_org, customer_id, target_category, trim(target_member_number), auth.uid())
  returning id into membership_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', membership_id, jsonb_build_object('customer_id', customer_id, 'member_number', trim(target_member_number)));

  return membership_id;
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_membership(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_membership(uuid, uuid, text, text, text, text, text, text) to authenticated;

create function public.set_membership_status(target_membership uuid, target_status text, target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_status not in ('active', 'suspended', 'cancelled') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update public.memberships set
    status = target_status, status_reason = nullif(trim(coalesce(target_reason, '')), ''),
    status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
  where id = target_membership;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (membership_row.organization_id, auth.uid(), 'membership.status_changed', 'membership', target_membership,
    jsonb_build_object('status', membership_row.status), jsonb_build_object('status', target_status, 'reason', target_reason));
end;
$$;
revoke all on function public.set_membership_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_membership_status(uuid, text, text) to authenticated;

-- Busca socios por nombre, email, documento o número de socio. Trae el estado de la
-- cuota más reciente calculado al vuelo (no se guarda, para no desincronizarse).
create function public.search_memberships(target_org uuid, target_query text default '')
returns table (
  membership_id uuid, customer_id uuid, member_number text, first_name text, last_name text,
  email text, document text, category_name text, membership_status text,
  due_status text, due_amount bigint, due_date date
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    m.id, c.id, m.member_number, c.first_name, c.last_name, c.email, c.document, mc.name, m.status,
    case when d.id is null then null
      when d.paid_at is not null then 'paid'
      when d.due_date < current_date then 'overdue'
      else 'pending' end,
    d.amount, d.due_date
  from public.memberships m
  join public.customers c on c.id = m.customer_id
  join public.membership_categories mc on mc.id = m.membership_category_id
  left join lateral (
    select * from public.membership_dues dd where dd.membership_id = m.id order by dd.period desc limit 1
  ) d on true
  where m.organization_id = target_org
    and (
      target_query is null or trim(target_query) = ''
      or c.first_name ilike '%' || target_query || '%' or c.last_name ilike '%' || target_query || '%'
      or c.document = target_query or m.member_number = target_query or c.email ilike '%' || target_query || '%'
    )
  order by c.last_name, c.first_name;
end;
$$;
revoke all on function public.search_memberships(uuid, text) from public, anon, authenticated;
grant execute on function public.search_memberships(uuid, text) to authenticated;

create function public.get_membership_detail(target_membership uuid)
returns table (
  membership_id uuid, organization_id uuid, customer_id uuid, member_number text,
  first_name text, last_name text, email text, phone text, document text,
  category_id uuid, category_name text, membership_status text, status_reason text,
  status_changed_at timestamptz, starts_at date, notes text
)
language plpgsql stable security definer set search_path = '' as $$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select m.id, m.organization_id, c.id, m.member_number, c.first_name, c.last_name, c.email, c.phone, c.document,
    mc.id, mc.name, m.status, m.status_reason, m.status_changed_at, m.starts_at, c.notes
  from public.memberships m
  join public.customers c on c.id = m.customer_id
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.id = target_membership;
end;
$$;
revoke all on function public.get_membership_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_membership_detail(uuid) to authenticated;

create function public.get_membership_dues(target_membership uuid)
returns table (due_id uuid, period date, amount bigint, due_date date, paid_at timestamptz,
  paid_amount bigint, payment_method text, payment_reference text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select d.id, d.period, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method, d.payment_reference,
    case when d.paid_at is not null then 'paid' when d.due_date < current_date then 'overdue' else 'pending' end
  from public.membership_dues d
  where d.membership_id = target_membership
  order by d.period desc;
end;
$$;
revoke all on function public.get_membership_dues(uuid) from public, anon, authenticated;
grant execute on function public.get_membership_dues(uuid) to authenticated;

create function public.create_membership_due(target_membership uuid, target_period date, target_amount bigint, target_due_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare membership_row public.memberships; due_id uuid;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (membership_row.organization_id, target_membership, date_trunc('month', target_period)::date, target_amount, target_due_date)
  on conflict (membership_id, period) do nothing
  returning id into due_id;
  return due_id;
end;
$$;
revoke all on function public.create_membership_due(uuid, date, bigint, date) from public, anon, authenticated;
grant execute on function public.create_membership_due(uuid, date, bigint, date) to authenticated;

-- Genera la cuota del período para todos los socios activos de una categoría (o de todas,
-- si target_category es null), usando el monto configurado en la categoría. Idempotente:
-- si ya existe la cuota de ese período para un socio, la salta.
create function public.generate_dues_for_period(target_org uuid, target_category uuid, target_period date, target_due_date date)
returns integer language plpgsql security definer set search_path = '' as $$
declare created_count integer := 0;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  select target_org, m.id, date_trunc('month', target_period)::date, mc.monthly_fee_amount, target_due_date
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and (target_category is null or m.membership_category_id = target_category)
  on conflict (membership_id, period) do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;
revoke all on function public.generate_dues_for_period(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.generate_dues_for_period(uuid, uuid, date, date) to authenticated;

create function public.record_manual_due_payment(
  target_due uuid, target_paid_amount bigint, target_payment_method text, target_payment_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare due_row public.membership_dues; org_id uuid;
begin
  select * into due_row from public.membership_dues where id = target_due;
  if not found then raise exception 'DUE_NOT_FOUND' using errcode = 'P0001'; end if;
  select organization_id into org_id from public.memberships where id = due_row.membership_id;
  if auth.uid() is null or not public.can_manage_club(org_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if due_row.paid_at is not null then raise exception 'DUE_ALREADY_PAID' using errcode = 'P0001'; end if;
  if target_payment_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;
  update public.membership_dues set
    paid_at = now(), paid_amount = target_paid_amount, payment_method = target_payment_method,
    payment_reference = nullif(trim(coalesce(target_payment_reference, '')), ''), registered_by = auth.uid()
  where id = target_due;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'membership_due.paid_manual', 'membership_due', target_due,
    jsonb_build_object('amount', target_paid_amount, 'method', target_payment_method));
end;
$$;
revoke all on function public.record_manual_due_payment(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.record_manual_due_payment(uuid, bigint, text, text) to authenticated;
