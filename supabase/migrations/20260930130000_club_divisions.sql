-- Divisiones: disciplinas/actividades del club (Fútbol, Básquet, Natación...). Un socio puede
-- estar anotado en varias a la vez, y cada división tiene su propia cuota mensual, separada
-- de la cuota de categoría de socio. Mismo patrón que memberships/membership_dues (alta
-- automática de la primera cuota, vencimiento anclado al día de inscripción, pago manual),
-- pero en su propio set de tablas porque el "titular" de la cuota acá es la inscripción a una
-- división puntual, no la membresía en general.

create table public.divisions (
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

create table public.membership_division_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive')),
  starts_at date not null default current_date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (membership_id, division_id)
);
create index membership_division_enrollments_division_idx on public.membership_division_enrollments(division_id, status);

create table public.division_dues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  enrollment_id uuid not null references public.membership_division_enrollments(id) on delete cascade,
  period date not null,
  amount bigint not null check (amount >= 0),
  due_date date not null,
  paid_at timestamptz,
  paid_amount bigint check (paid_amount is null or paid_amount >= 0),
  payment_method text check (payment_method in ('cash', 'transfer', 'other')),
  payment_reference text,
  registered_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (enrollment_id, period)
);
create index division_dues_enrollment_idx on public.division_dues(enrollment_id, period desc);

alter table public.divisions enable row level security;
alter table public.membership_division_enrollments enable row level security;
alter table public.division_dues enable row level security;

create policy divisions_manage on public.divisions for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
create policy membership_division_enrollments_manage on public.membership_division_enrollments for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
create policy division_dues_manage on public.division_dues for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));

grant select, insert, update, delete on public.divisions, public.membership_division_enrollments, public.division_dues to authenticated;
grant all on public.divisions, public.membership_division_enrollments, public.division_dues to service_role;

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

create function public.upsert_division(target_org uuid, target_id uuid, target_name text, target_monthly_fee_amount bigint, target_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare division_id uuid;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 60 or target_monthly_fee_amount < 0 then
    raise exception 'INVALID_DIVISION' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.divisions (organization_id, name, monthly_fee_amount, active)
    values (target_org, trim(target_name), target_monthly_fee_amount, coalesce(target_active, true))
    returning id into division_id;
  else
    update public.divisions
    set name = trim(target_name), monthly_fee_amount = target_monthly_fee_amount, active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org
    returning id into division_id;
    if division_id is null then raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return division_id;
exception when unique_violation then
  raise exception 'DIVISION_NAME_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function public.upsert_division(uuid, uuid, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.upsert_division(uuid, uuid, text, bigint, boolean) to authenticated;

create function public.list_divisions(target_org uuid)
returns table (division_id uuid, name text, monthly_fee_amount bigint, active boolean, enrolled_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select d.id, d.name, d.monthly_fee_amount, d.active,
    (select count(*) from public.membership_division_enrollments e where e.division_id = d.id and e.status = 'active')
  from public.divisions d
  where d.organization_id = target_org
  order by d.sort_order, d.name;
end;
$$;
revoke all on function public.list_divisions(uuid) from public, anon, authenticated;
grant execute on function public.list_divisions(uuid) to authenticated;

create function public.get_division_detail(target_division uuid)
returns table (division_id uuid, organization_id uuid, name text, monthly_fee_amount bigint, active boolean)
language plpgsql stable security definer set search_path = '' as $$
declare division_row public.divisions;
begin
  select * into division_row from public.divisions where id = target_division;
  if not found or auth.uid() is null or not public.can_manage_club(division_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query select division_row.id, division_row.organization_id, division_row.name, division_row.monthly_fee_amount, division_row.active;
end;
$$;
revoke all on function public.get_division_detail(uuid) from public, anon, authenticated;
grant execute on function public.get_division_detail(uuid) to authenticated;

-- Inscribe un socio a una división: crea la inscripción (o la reactiva si ya existía y estaba
-- inactiva) y genera automáticamente su primera cuota, mismo criterio de fecha que memberships
-- (vence el mismo día del mes que la inscripción, un mes después).
create function public.enroll_membership_in_division(target_membership uuid, target_division uuid)
returns table (
  enrollment_id uuid, due_id uuid, customer_email text, customer_first_name text,
  organization_name text, division_name text, due_period date, due_amount bigint, due_date date,
  brand_logo_url text, brand_name text, brand_accent_color text
) language plpgsql security definer set search_path = '' as $$
declare
  membership_row public.memberships;
  division_row public.divisions;
  new_enrollment_id uuid;
  new_due_id uuid;
  first_period date;
  buyer_email text;
  buyer_first_name text;
  org_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into division_row from public.divisions where id = target_division and organization_id = membership_row.organization_id;
  if not found then raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.membership_division_enrollments (organization_id, membership_id, division_id, created_by)
  values (membership_row.organization_id, target_membership, target_division, auth.uid())
  on conflict (membership_id, division_id) do update set status = 'active', starts_at = current_date
  returning id into new_enrollment_id;

  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = membership_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = membership_row.organization_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
  values (membership_row.organization_id, new_enrollment_id, first_period, division_row.monthly_fee_amount,
    public.membership_due_date_for_period(current_date, first_period))
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning id into new_due_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (membership_row.organization_id, auth.uid(), 'division.enrolled', 'membership_division_enrollment', new_enrollment_id,
    jsonb_build_object('membership_id', target_membership, 'division_id', target_division));

  return query select new_enrollment_id, new_due_id, buyer_email, buyer_first_name, org_name, division_row.name,
    first_period, division_row.monthly_fee_amount, public.membership_due_date_for_period(current_date, first_period),
    logo_url, name_override, accent_color;
end;
$$;
revoke all on function public.enroll_membership_in_division(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enroll_membership_in_division(uuid, uuid) to authenticated;

create function public.remove_membership_from_division(target_enrollment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare enrollment_row public.membership_division_enrollments;
begin
  select * into enrollment_row from public.membership_division_enrollments where id = target_enrollment;
  if not found or auth.uid() is null or not public.can_manage_club(enrollment_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.membership_division_enrollments set status = 'inactive' where id = target_enrollment;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (enrollment_row.organization_id, auth.uid(), 'division.unenrolled', 'membership_division_enrollment', target_enrollment);
end;
$$;
revoke all on function public.remove_membership_from_division(uuid) from public, anon, authenticated;
grant execute on function public.remove_membership_from_division(uuid) to authenticated;

-- Socios inscriptos en una división puntual, con el estado de su última cuota (para la
-- pantalla de detalle de la división).
create function public.get_division_enrollments(target_division uuid)
returns table (
  enrollment_id uuid, membership_id uuid, member_number text, first_name text, last_name text, email text,
  due_status text, due_amount bigint, due_date date
)
language plpgsql stable security definer set search_path = '' as $$
declare division_row public.divisions;
begin
  select * into division_row from public.divisions where id = target_division;
  if not found or auth.uid() is null or not public.can_manage_club(division_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select e.id, m.id, m.member_number, c.first_name, c.last_name, c.email,
    case when d.id is null then null
      when d.paid_at is not null then 'paid'
      when d.due_date < current_date then 'overdue'
      else 'pending' end,
    d.amount, d.due_date
  from public.membership_division_enrollments e
  join public.memberships m on m.id = e.membership_id
  join public.customers c on c.id = m.customer_id
  left join lateral (
    select * from public.division_dues dd where dd.enrollment_id = e.id order by dd.period desc limit 1
  ) d on true
  where e.division_id = target_division and e.status = 'active'
  order by c.last_name, c.first_name;
end;
$$;
revoke all on function public.get_division_enrollments(uuid) from public, anon, authenticated;
grant execute on function public.get_division_enrollments(uuid) to authenticated;

-- Divisiones donde está anotado un socio puntual (para mostrar en su ficha).
create function public.get_membership_divisions(target_membership uuid)
returns table (enrollment_id uuid, division_id uuid, division_name text, monthly_fee_amount bigint, due_status text, due_amount bigint, due_date date)
language plpgsql stable security definer set search_path = '' as $$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select e.id, dv.id, dv.name, dv.monthly_fee_amount,
    case when d.id is null then null
      when d.paid_at is not null then 'paid'
      when d.due_date < current_date then 'overdue'
      else 'pending' end,
    d.amount, d.due_date
  from public.membership_division_enrollments e
  join public.divisions dv on dv.id = e.division_id
  left join lateral (
    select * from public.division_dues dd where dd.enrollment_id = e.id order by dd.period desc limit 1
  ) d on true
  where e.membership_id = target_membership and e.status = 'active'
  order by dv.name;
end;
$$;
revoke all on function public.get_membership_divisions(uuid) from public, anon, authenticated;
grant execute on function public.get_membership_divisions(uuid) to authenticated;

create function public.get_division_dues(target_enrollment uuid)
returns table (due_id uuid, period date, amount bigint, due_date date, paid_at timestamptz,
  paid_amount bigint, payment_method text, payment_reference text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare enrollment_row public.membership_division_enrollments;
begin
  select * into enrollment_row from public.membership_division_enrollments where id = target_enrollment;
  if not found or auth.uid() is null or not public.can_manage_club(enrollment_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select d.id, d.period, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method, d.payment_reference,
    case when d.paid_at is not null then 'paid' when d.due_date < current_date then 'overdue' else 'pending' end
  from public.division_dues d
  where d.enrollment_id = target_enrollment
  order by d.period desc;
end;
$$;
revoke all on function public.get_division_dues(uuid) from public, anon, authenticated;
grant execute on function public.get_division_dues(uuid) to authenticated;

create function public.create_division_due(target_enrollment uuid, target_period date, target_amount bigint, target_due_date date)
returns table (due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text,
  due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
language plpgsql security definer set search_path = '' as $$
declare
  enrollment_row public.membership_division_enrollments;
  membership_row public.memberships;
  division_row public.divisions;
  new_due_id uuid;
  buyer_email text;
  buyer_first_name text;
  org_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  select * into enrollment_row from public.membership_division_enrollments where id = target_enrollment;
  if not found or auth.uid() is null or not public.can_manage_club(enrollment_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  select * into membership_row from public.memberships where id = enrollment_row.membership_id;
  select * into division_row from public.divisions where id = enrollment_row.division_id;
  insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
  values (enrollment_row.organization_id, target_enrollment, date_trunc('month', target_period)::date, target_amount, target_due_date)
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning id into new_due_id;
  if new_due_id is null then return; end if;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = enrollment_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = enrollment_row.organization_id;
  return query select new_due_id, buyer_email, buyer_first_name, org_name, division_row.name,
    date_trunc('month', target_period)::date, target_amount, target_due_date, logo_url, name_override, accent_color;
end;
$$;
revoke all on function public.create_division_due(uuid, date, bigint, date) from public, anon, authenticated;
grant execute on function public.create_division_due(uuid, date, bigint, date) to authenticated;

-- Genera la cuota del período para todos los inscriptos activos de una división.
create function public.generate_division_dues_for_period(target_division uuid, target_period date)
returns table (due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text,
  due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
language plpgsql security definer set search_path = '' as $$
declare division_row public.divisions; org_name text; logo_url text; name_override text; accent_color text;
begin
  select * into division_row from public.divisions where id = target_division;
  if not found or auth.uid() is null or not public.can_manage_club(division_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select o.name into org_name from public.organizations o where o.id = division_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = division_row.organization_id;
  return query
  insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
  select division_row.organization_id, e.id, date_trunc('month', target_period)::date, division_row.monthly_fee_amount,
    public.membership_due_date_for_period(e.starts_at, target_period)
  from public.membership_division_enrollments e
  where e.division_id = target_division and e.status = 'active'
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning
    division_dues.id,
    (select c.email from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    (select c.first_name from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    org_name, division_row.name, division_dues.period, division_dues.amount, division_dues.due_date,
    logo_url, name_override, accent_color;
end;
$$;
revoke all on function public.generate_division_dues_for_period(uuid, date) from public, anon, authenticated;
grant execute on function public.generate_division_dues_for_period(uuid, date) to authenticated;

create function public.record_manual_division_due_payment(
  target_due uuid, target_paid_amount bigint, target_payment_method text, target_payment_reference text
) returns table (customer_email text, customer_first_name text, organization_name text, division_name text,
  due_period date, paid_amount bigint, payment_method text, brand_logo_url text, brand_name text, brand_accent_color text)
language plpgsql security definer set search_path = '' as $$
declare
  due_row public.division_dues; enrollment_row public.membership_division_enrollments; membership_row public.memberships;
  division_row public.divisions; buyer_email text; buyer_first_name text; org_name text;
  logo_url text; name_override text; accent_color text;
begin
  select * into due_row from public.division_dues where id = target_due;
  if not found then raise exception 'DUE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into enrollment_row from public.membership_division_enrollments where id = due_row.enrollment_id;
  if auth.uid() is null or not public.can_manage_club(enrollment_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if due_row.paid_at is not null then raise exception 'DUE_ALREADY_PAID' using errcode = 'P0001'; end if;
  if target_payment_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;
  update public.division_dues set
    paid_at = now(), paid_amount = target_paid_amount, payment_method = target_payment_method,
    payment_reference = nullif(trim(coalesce(target_payment_reference, '')), ''), registered_by = auth.uid()
  where id = target_due;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (enrollment_row.organization_id, auth.uid(), 'division_due.paid_manual', 'division_due', target_due,
    jsonb_build_object('amount', target_paid_amount, 'method', target_payment_method));
  select * into membership_row from public.memberships where id = enrollment_row.membership_id;
  select * into division_row from public.divisions where id = enrollment_row.division_id;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = enrollment_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = enrollment_row.organization_id;
  return query select buyer_email, buyer_first_name, org_name, division_row.name, due_row.period, target_paid_amount, target_payment_method,
    logo_url, name_override, accent_color;
end;
$$;
revoke all on function public.record_manual_division_due_payment(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.record_manual_division_due_payment(uuid, bigint, text, text) to authenticated;

-- Divisiones donde el socio NO está anotado todavía (para el picker de "Anotar a división").
create function public.get_available_divisions_for_membership(target_membership uuid)
returns table (division_id uuid, name text, monthly_fee_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select d.id, d.name, d.monthly_fee_amount
  from public.divisions d
  where d.organization_id = membership_row.organization_id and d.active = true
    and not exists (
      select 1 from public.membership_division_enrollments e
      where e.membership_id = target_membership and e.division_id = d.id and e.status = 'active'
    )
  order by d.name;
end;
$$;
revoke all on function public.get_available_divisions_for_membership(uuid) from public, anon, authenticated;
grant execute on function public.get_available_divisions_for_membership(uuid) to authenticated;
