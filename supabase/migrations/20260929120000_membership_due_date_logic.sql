-- Fija la lógica de vencimiento de cuotas: siempre ancladas al día en que el socio se dio de
-- alta (starts_at), no a una fecha arbitraria "+10 días" que se elegía a mano cada vez.
--   - Al dar de alta un socio se genera automáticamente su primera cuota, del mes siguiente,
--     con vencimiento el mismo día del mes que el alta (ej. alta el 5 → vence el 5 del mes que
--     viene). Eso sigue siendo editable a mano si hace falta (create_membership_due).
--   - "Generar cuotas del mes" (en lote) ya no pide una fecha de vencimiento única para todos:
--     cada socio vence según su propio día de alta, clampeado al último día del mes si ese mes
--     es más corto (ej. alta el 31 → en febrero vence el 28).

create function public.membership_due_date_for_period(target_starts_at date, target_period date)
returns date language sql immutable set search_path = '' as $$
  select date_trunc('month', target_period)::date
    + (least(
        extract(day from target_starts_at)::int,
        extract(day from ((date_trunc('month', target_period) + interval '1 month - 1 day'))::date)::int
      ) - 1);
$$;
grant execute on function public.membership_due_date_for_period(date, date) to authenticated;

-- create_membership: igual que antes, pero ahora también genera la primera cuota (mes que
-- viene, vence el día de alta) para no depender de un paso manual aparte.
create or replace function public.create_membership(
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
  monthly_fee bigint;
  first_period date;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select mc.monthly_fee_amount into monthly_fee from public.membership_categories mc
  where mc.id = target_category and mc.organization_id = target_org;
  if monthly_fee is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
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

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (target_org, membership_id, first_period, monthly_fee, public.membership_due_date_for_period(current_date, first_period));

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', membership_id, jsonb_build_object('customer_id', customer_id, 'member_number', trim(target_member_number)));

  return membership_id;
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$$;

-- generate_dues_for_period: ya no recibe una fecha de vencimiento global; cada socio vence
-- según su propio día de alta (membership_due_date_for_period).
create or replace function public.generate_dues_for_period(target_org uuid, target_category uuid, target_period date)
returns integer language plpgsql security definer set search_path = '' as $$
declare created_count integer := 0;
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  select target_org, m.id, date_trunc('month', target_period)::date, mc.monthly_fee_amount,
    public.membership_due_date_for_period(m.starts_at, target_period)
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and (target_category is null or m.membership_category_id = target_category)
  on conflict (membership_id, period) do nothing;
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;
