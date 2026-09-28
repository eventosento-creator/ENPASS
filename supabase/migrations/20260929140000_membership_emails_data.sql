-- Los mails de socios (bienvenida, cuota generada, pago confirmado) se arman y mandan desde
-- Next.js (mismo SmtpEmailProvider que usa el resto de ENPASS), pero club_staff no puede leer
-- customers/organizations directo (esa RLS es can_manage_org). En vez de agregar más RPCs de
-- lectura, hacemos que las RPCs de escritura ya devuelvan los datos que el mail necesita —así
-- no hay una segunda consulta que se pueda desincronizar con lo que se acaba de escribir.

-- 20260929130000 agregó target_customer_id vía "create or replace", pero al cambiar la firma
-- (un parámetro más) eso NO reemplaza la función anterior en Postgres — crea un segundo
-- overload y deja las dos ambiguas para cualquier llamado por nombre de parámetro (como hace
-- PostgREST). Se corrige acá, dropeando explícitamente la versión vieja de 8 argumentos.
drop function if exists public.create_membership(uuid, uuid, text, text, text, text, text, text);
drop function if exists public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid);
create function public.create_membership(
  target_org uuid,
  target_category uuid,
  target_member_number text,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_phone text,
  target_document text,
  target_customer_id uuid default null
) returns table (
  membership_id uuid, due_id uuid, customer_email text, customer_first_name text,
  organization_name text, category_name text, due_period date, due_amount bigint, due_date date
) language plpgsql security definer set search_path = '' as $$
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
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select mc.monthly_fee_amount, mc.name into monthly_fee, category_label from public.membership_categories mc
  where mc.id = target_category and mc.organization_id = target_org;
  if monthly_fee is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  select o.name into org_name from public.organizations o where o.id = target_org;

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

  insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by)
  values (target_org, resolved_customer_id, target_category, trim(target_member_number), auth.uid())
  returning id into new_membership_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (target_org, new_membership_id, first_period, monthly_fee, public.membership_due_date_for_period(current_date, first_period))
  returning id into new_due_id;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', new_membership_id, jsonb_build_object('customer_id', resolved_customer_id, 'member_number', trim(target_member_number), 'linked_existing', target_customer_id is not null));

  return query select new_membership_id, new_due_id, buyer_email, buyer_first_name, org_name, category_label, first_period, monthly_fee,
    public.membership_due_date_for_period(current_date, first_period);
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;

-- create_membership_due: ahora también devuelve lo necesario para el mail de "cuota generada".
drop function if exists public.create_membership_due(uuid, date, bigint, date);
create function public.create_membership_due(target_membership uuid, target_period date, target_amount bigint, target_due_date date)
returns table (due_id uuid, customer_email text, customer_first_name text, organization_name text, due_period date, due_amount bigint, due_date date)
language plpgsql security definer set search_path = '' as $$
declare
  membership_row public.memberships;
  new_due_id uuid;
  buyer_email text;
  buyer_first_name text;
  org_name text;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.can_manage_club(membership_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (membership_row.organization_id, target_membership, date_trunc('month', target_period)::date, target_amount, target_due_date)
  on conflict (membership_id, period) do nothing
  returning id into new_due_id;
  if new_due_id is null then return; end if;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = membership_row.organization_id;
  return query select new_due_id, buyer_email, buyer_first_name, org_name, date_trunc('month', target_period)::date, target_amount, target_due_date;
end;
$$;
revoke all on function public.create_membership_due(uuid, date, bigint, date) from public, anon, authenticated;
grant execute on function public.create_membership_due(uuid, date, bigint, date) to authenticated;

-- generate_dues_for_period: devuelve el detalle de cada cuota creada (para mandar el mail a
-- cada socio), no solo el conteo.
-- Mismo problema que create_membership de arriba: 20260929120000 le sacó el 4to argumento
-- (target_due_date) vía "create or replace", lo que dejó dos overloads ambiguos en vez de uno.
drop function if exists public.generate_dues_for_period(uuid, uuid, date, date);
drop function if exists public.generate_dues_for_period(uuid, uuid, date);
create function public.generate_dues_for_period(target_org uuid, target_category uuid, target_period date)
returns table (due_id uuid, customer_email text, customer_first_name text, organization_name text, due_period date, due_amount bigint, due_date date)
language plpgsql security definer set search_path = '' as $$
declare org_name text;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select o.name into org_name from public.organizations o where o.id = target_org;
  return query
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  select target_org, m.id, date_trunc('month', target_period)::date, mc.monthly_fee_amount,
    public.membership_due_date_for_period(m.starts_at, target_period)
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and (target_category is null or m.membership_category_id = target_category)
  on conflict (membership_id, period) do nothing
  returning
    membership_dues.id,
    (select c.email from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    (select c.first_name from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    org_name,
    membership_dues.period,
    membership_dues.amount,
    membership_dues.due_date;
end;
$$;
revoke all on function public.generate_dues_for_period(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.generate_dues_for_period(uuid, uuid, date) to authenticated;

-- record_manual_due_payment: devuelve el detalle para el mail de "pago confirmado".
drop function if exists public.record_manual_due_payment(uuid, bigint, text, text);
create function public.record_manual_due_payment(
  target_due uuid, target_paid_amount bigint, target_payment_method text, target_payment_reference text
) returns table (customer_email text, customer_first_name text, organization_name text, due_period date, paid_amount bigint, payment_method text)
language plpgsql security definer set search_path = '' as $$
declare due_row public.membership_dues; org_id uuid; buyer_email text; buyer_first_name text; org_name text;
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
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c
    join public.memberships m on m.customer_id = c.id where m.id = due_row.membership_id;
  select o.name into org_name from public.organizations o where o.id = org_id;
  return query select buyer_email, buyer_first_name, org_name, due_row.period, target_paid_amount, target_payment_method;
end;
$$;
revoke all on function public.record_manual_due_payment(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.record_manual_due_payment(uuid, bigint, text, text) to authenticated;
