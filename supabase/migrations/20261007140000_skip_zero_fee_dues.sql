-- Una categoría puede ser solo un grupo (ej. "Futsal") sin precio: el precio lo tienen sus divisiones (C13, C17, 1ra).
-- "Generar cuotas del mes" no debe crear cuotas de $0 (ni mandar mails de cuota) para esas categorías.
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
  select target_org, m.id, date_trunc('month', target_period)::date, mc.monthly_fee_amount,
    public.membership_due_date_for_period(m.starts_at, target_period)
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and mc.monthly_fee_amount > 0
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
