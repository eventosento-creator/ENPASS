-- Permite buscar entre las personas que ya compraron/asistieron a un evento (tabla customers)
-- para vincularlas directo como socio, en vez de tener que reescribir sus datos a mano y confiar
-- en que el email/DNI coincidan exacto. club_staff no tiene acceso de lectura a customers (esa
-- RLS es can_manage_org), así que esto va por RPC security definer, mismo patrón que el resto
-- del módulo de clubes.

create function public.search_customers_for_club(target_org uuid, target_query text default '')
returns table (
  customer_id uuid, first_name text, last_name text, email text, phone text, document text,
  already_member boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_club(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select c.id, c.first_name, c.last_name, c.email, c.phone, c.document,
    exists (select 1 from public.memberships m where m.customer_id = c.id and m.organization_id = target_org)
  from public.customers c
  where c.organization_id = target_org
    and (
      trim(target_query) = ''
      or c.first_name ilike '%' || target_query || '%' or c.last_name ilike '%' || target_query || '%'
      or c.email ilike '%' || target_query || '%' or c.document = target_query
    )
  order by c.first_name, c.last_name
  limit 20;
end;
$$;
revoke all on function public.search_customers_for_club(uuid, text) from public, anon, authenticated;
grant execute on function public.search_customers_for_club(uuid, text) to authenticated;

-- create_membership: si se pasa target_customer_id, vincula esa persona puntual (ya validada
-- por la búsqueda de arriba) en vez de buscar/crear por email — más preciso que confiar en el
-- matching automático por email/DNI.
create or replace function public.create_membership(
  target_org uuid,
  target_category uuid,
  target_member_number text,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_phone text,
  target_document text,
  target_customer_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  resolved_customer_id uuid;
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

  insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by)
  values (target_org, resolved_customer_id, target_category, trim(target_member_number), auth.uid())
  returning id into membership_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (target_org, membership_id, first_period, monthly_fee, public.membership_due_date_for_period(current_date, first_period));

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', membership_id, jsonb_build_object('customer_id', resolved_customer_id, 'member_number', trim(target_member_number), 'linked_existing', target_customer_id is not null));

  return membership_id;
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$$;
