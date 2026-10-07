-- Membresías / planes de cobro: definen CUÁNTO paga cada socio (estándar, planes familiares, becados),
-- aparte de qué actividad hace (categoría y división).
--  - none:    paga el precio completo de cada cuota.
--  - percent: descuento en % sobre cada cuota (100% = becado total).
--  - fixed:   valor fijo POR CADA cuota (la del club y la de cada división); 0 = becado.
-- Un socio sin plan paga el precio completo. El plan rige para las cuotas que se generen de ahí en adelante
-- (las ya creadas no se tocan). Las cuotas que dan $0 no se generan.

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  kind text not null default 'standard' check (kind in ('standard', 'family', 'scholarship')),
  pricing_mode text not null default 'none' check (pricing_mode in ('none', 'percent', 'fixed')),
  discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  fixed_amount bigint not null default 0 check (fixed_amount >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.membership_plans enable row level security;
drop policy if exists membership_plans_manage on public.membership_plans;
create policy membership_plans_manage on public.membership_plans for all to authenticated
  using ((select public.can_manage_club(organization_id))) with check ((select public.can_manage_club(organization_id)));
grant select, insert, update, delete on public.membership_plans to authenticated;
grant all on public.membership_plans to service_role;

alter table public.memberships add column if not exists membership_plan_id uuid references public.membership_plans(id) on delete set null;
create index if not exists memberships_plan_idx on public.memberships(membership_plan_id);

-- Precio final de una cuota según el plan del socio.
create or replace function public.apply_membership_plan(base_amount bigint, plan_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p.pricing_mode
      when 'percent' then round(base_amount * (10000 - p.discount_bps) / 10000.0)::bigint
      when 'fixed' then p.fixed_amount
      else base_amount end
    from public.membership_plans p where p.id = plan_id
  ), base_amount);
$$;
revoke all on function public.apply_membership_plan(bigint, uuid) from public, anon, authenticated;

create or replace function public.upsert_membership_plan(target_org uuid, target_id uuid, target_name text, target_kind text, target_mode text, target_discount_bps integer, target_fixed_amount bigint, target_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare plan_id uuid;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(target_name, ''))) not between 1 and 60 or target_kind not in ('standard', 'family', 'scholarship')
    or target_mode not in ('none', 'percent', 'fixed') or coalesce(target_discount_bps, 0) not between 0 and 10000 or coalesce(target_fixed_amount, 0) < 0 then
    raise exception 'INVALID_PLAN' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.membership_plans (organization_id, name, kind, pricing_mode, discount_bps, fixed_amount, active)
    values (target_org, trim(target_name), target_kind, target_mode,
      case when target_mode = 'percent' then coalesce(target_discount_bps, 0) else 0 end,
      case when target_mode = 'fixed' then coalesce(target_fixed_amount, 0) else 0 end, coalesce(target_active, true))
    returning id into plan_id;
  else
    update public.membership_plans set name = trim(target_name), kind = target_kind, pricing_mode = target_mode,
      discount_bps = case when target_mode = 'percent' then coalesce(target_discount_bps, 0) else 0 end,
      fixed_amount = case when target_mode = 'fixed' then coalesce(target_fixed_amount, 0) else 0 end,
      active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org returning id into plan_id;
    if plan_id is null then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return plan_id;
exception when unique_violation then
  raise exception 'PLAN_NAME_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function public.upsert_membership_plan(uuid, uuid, text, text, text, integer, bigint, boolean) from public, anon, authenticated;
grant execute on function public.upsert_membership_plan(uuid, uuid, text, text, text, integer, bigint, boolean) to authenticated;

create or replace function public.delete_membership_plan(target_org uuid, target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_plans where id = target_id and organization_id = target_org) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships where membership_plan_id = target_id) then
    raise exception 'PLAN_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.membership_plans where id = target_id and organization_id = target_org;
end;
$$;
revoke all on function public.delete_membership_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_membership_plan(uuid, uuid) to authenticated;

-- Asigna (o quita, con null) el plan de un socio. Rige para las próximas cuotas.
create or replace function public.set_membership_plan(target_membership uuid, target_plan uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  select organization_id into org from public.memberships where id = target_membership;
  if org is null or auth.uid() is null or not public.can_manage_club(org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_plan is not null and not exists (select 1 from public.membership_plans where id = target_plan and organization_id = org) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.memberships set membership_plan_id = target_plan, updated_at = now() where id = target_membership;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org, auth.uid(), 'membership.plan.changed', 'membership', target_membership, jsonb_build_object('plan_id', target_plan));
end;
$$;
revoke all on function public.set_membership_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_membership_plan(uuid, uuid) to authenticated;


drop function if exists public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid);
create or replace function public.create_membership(target_org uuid, target_category uuid, target_member_number text, target_first_name text, target_last_name text, target_email text, target_phone text, target_document text, target_customer_id uuid DEFAULT NULL::uuid, target_plan uuid DEFAULT NULL::uuid)
 RETURNS TABLE(membership_id uuid, due_id uuid, customer_email text, customer_first_name text, organization_name text, category_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resolved_customer_id uuid;
  new_membership_id uuid;
  new_due_id uuid;
  monthly_fee bigint;
  first_period date;
  category_label text;
  org_name text;
  buyer_email text;
  buyer_first_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select mc.monthly_fee_amount, mc.name into monthly_fee, category_label from public.membership_categories mc
  where mc.id = target_category and mc.organization_id = target_org;
  if monthly_fee is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  if target_plan is not null and not exists (select 1 from public.membership_plans where id = target_plan and organization_id = target_org and active) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Precio de la primera cuota según el plan del socio.
  monthly_fee := public.apply_membership_plan(monthly_fee, target_plan);
  select o.name into org_name from public.organizations o where o.id = target_org;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = target_org;

  if target_customer_id is not null then
    select id into resolved_customer_id from public.customers where id = target_customer_id and organization_id = target_org;
    if resolved_customer_id is null then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001'; end if;
  else
    if char_length(trim(coalesce(target_member_number, ''))) < 1 or char_length(trim(coalesce(target_first_name, ''))) < 1
      or char_length(trim(coalesce(target_last_name, ''))) < 1 or target_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'INVALID_MEMBER_DATA' using errcode = 'P0001';
    end if;

    select id into resolved_customer_id from public.customers
    where organization_id = target_org and lower(email) = lower(trim(target_email));

    if resolved_customer_id is null and target_document is not null and trim(target_document) <> '' then
      select id into resolved_customer_id from public.customers
      where organization_id = target_org and document = trim(target_document)
      limit 1;
    end if;

    if resolved_customer_id is null then
      insert into public.customers (organization_id, first_name, last_name, email, phone, document)
      values (target_org, trim(target_first_name), trim(target_last_name), lower(trim(target_email)), nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''))
      returning id into resolved_customer_id;
    else
      update public.customers set
        first_name = trim(target_first_name), last_name = trim(target_last_name),
        phone = coalesce(nullif(trim(coalesce(target_phone, '')), ''), phone),
        document = coalesce(nullif(trim(coalesce(target_document, '')), ''), document)
      where id = resolved_customer_id;
    end if;
  end if;

  if char_length(trim(coalesce(target_member_number, ''))) < 1 then
    raise exception 'INVALID_MEMBER_DATA' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.memberships m where m.organization_id = target_org and m.customer_id = resolved_customer_id) then
    raise exception 'CUSTOMER_ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = resolved_customer_id;

  insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by, membership_plan_id)
  values (target_org, resolved_customer_id, target_category, trim(target_member_number), auth.uid(), target_plan)
  returning id into new_membership_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  if monthly_fee > 0 then
    insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
    values (target_org, new_membership_id, first_period, monthly_fee, public.membership_due_date_for_period(current_date, first_period))
    returning id into new_due_id;
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', new_membership_id, jsonb_build_object('customer_id', resolved_customer_id, 'member_number', trim(target_member_number), 'linked_existing', target_customer_id is not null));

  return query select new_membership_id, new_due_id, buyer_email, buyer_first_name, org_name, category_label, first_period, monthly_fee,
    public.membership_due_date_for_period(current_date, first_period), logo_url, name_override, accent_color;
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$function$;

create or replace function public.enroll_membership_in_division(target_membership uuid, target_division uuid)
 RETURNS TABLE(enrollment_id uuid, due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  membership_row public.memberships;
  division_row public.divisions;
  new_enrollment_id uuid;
  new_due_id uuid;
  division_fee bigint;
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
  division_fee := public.apply_membership_plan(division_row.monthly_fee_amount, membership_row.membership_plan_id);
  if division_fee > 0 then
    insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
    values (membership_row.organization_id, new_enrollment_id, first_period, division_fee,
      public.membership_due_date_for_period(current_date, first_period))
    on conflict on constraint division_dues_enrollment_id_period_key do nothing
    returning id into new_due_id;
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (membership_row.organization_id, auth.uid(), 'division.enrolled', 'membership_division_enrollment', new_enrollment_id,
    jsonb_build_object('membership_id', target_membership, 'division_id', target_division));

  return query select new_enrollment_id, new_due_id, buyer_email, buyer_first_name, org_name, division_row.name,
    first_period, division_fee, public.membership_due_date_for_period(current_date, first_period),
    logo_url, name_override, accent_color;
end;
$function$;

create or replace function public.generate_division_dues_for_period(target_division uuid, target_period date)
 RETURNS TABLE(due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select division_row.organization_id, e.id, date_trunc('month', target_period)::date, public.apply_membership_plan(division_row.monthly_fee_amount, mem.membership_plan_id),
    public.membership_due_date_for_period(e.starts_at, target_period)
  from public.membership_division_enrollments e
  join public.memberships mem on mem.id = e.membership_id
  where e.division_id = target_division and e.status = 'active'
    and public.apply_membership_plan(division_row.monthly_fee_amount, mem.membership_plan_id) > 0
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning
    division_dues.id,
    (select c.email from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    (select c.first_name from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    org_name, division_row.name, division_dues.period, division_dues.amount, division_dues.due_date,
    logo_url, name_override, accent_color;
end;
$function$;

create or replace function public.generate_dues_for_period(target_org uuid, target_category uuid, target_period date)
returns table (due_id uuid, customer_email text, customer_first_name text, organization_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
language plpgsql security definer set search_path = '' as $$
declare org_name text; logo_url text; name_override text; accent_color text;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select o.name into org_name from public.organizations o where o.id = target_org;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = target_org;
  return query
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  select target_org, m.id, date_trunc('month', target_period)::date, public.apply_membership_plan(mc.monthly_fee_amount, m.membership_plan_id),
    public.membership_due_date_for_period(m.starts_at, target_period)
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and public.apply_membership_plan(mc.monthly_fee_amount, m.membership_plan_id) > 0
    and (target_category is null or m.membership_category_id = target_category)
  on conflict (membership_id, period) do nothing
  returning
    membership_dues.id,
    (select c.email from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    (select c.first_name from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    org_name,
    membership_dues.period,
    membership_dues.amount,
    membership_dues.due_date,
    logo_url, name_override, accent_color;
end;
$$;

notify pgrst, 'reload schema';
