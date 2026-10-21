-- Área de administración de ENPASS (/admin): vistas generales y de detalle para la cuenta de administrador de plataforma.
-- Todas son solo lectura y exigen is_platform_admin(). Mantienen separados, como pide el documento maestro:
--   * ventas (valor de las entradas, GMV del productor)  -> orders.subtotal_amount
--   * cargo de servicio (ingreso de ENPASS)               -> orders.service_fee_amount
--   * lo que ENPASS le debe a productores (transferencias)-> transfer_sales()

create or replace function public.admin_overview(target_from timestamptz, target_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  span interval := target_to - target_from;
  result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'sales', (select coalesce(sum(o.subtotal_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= target_from and o.created_at < target_to),
    'sales_prev', (select coalesce(sum(o.subtotal_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= target_from - span and o.created_at < target_from),
    'fees', (select coalesce(sum(o.service_fee_amount), 0) from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= target_from and o.created_at < target_to),
    'orders', (select count(*) from public.orders o where o.status = 'paid' and not o.is_courtesy and o.created_at >= target_from and o.created_at < target_to),
    'tickets', (select count(*) from public.tickets t where t.status = 'valid' and t.issued_at >= target_from and t.issued_at < target_to),
    'events_in_period', (select count(distinct o.event_id) from public.orders o where o.status = 'paid' and o.created_at >= target_from and o.created_at < target_to),
    'active_events', (select count(*) from public.events e where e.status in ('published', 'sold_out') and coalesce(e.ends_at, e.starts_at + interval '12 hours') >= now()),
    'owed_total', (select coalesce(sum(s.subtotal_amount), 0) from public.organizations org cross join lateral public.transfer_sales(org.id) s where s.payout_id is null or s.payout_status = 'pending'),
    'owed_orgs', (select count(distinct org.id) from public.organizations org cross join lateral public.transfer_sales(org.id) s where s.payout_id is null or s.payout_status = 'pending'),
    'actions', jsonb_build_object(
      'transfers_review', (select count(*) from public.payments p where p.provider = 'manual' and p.method = 'bank_transfer' and p.status = 'processing' and p.transfer_proof_path is not null),
      'listings_pending', (select count(*) from public.club_settings c where c.public_listing_status = 'pending'),
      'payouts_to_pay', (select count(*) from public.transfer_payouts tp where tp.status = 'pending') + (select count(*) from public.club_payouts cp where cp.status = 'pending'),
      'payouts_ready', (select count(distinct org.id) from public.organizations org cross join lateral public.transfer_sales(org.id) s where s.payout_id is null and s.event_ended),
      'conflicts', (select count(*) from public.payments p where p.status in ('approved_inventory_conflict', 'approved_duplicate_charge') or p.requires_action)
    ),
    'methods', coalesce((select jsonb_agg(jsonb_build_object('method', m.method, 'amount', m.amount) order by m.amount desc) from (
      select case when p.method is null or p.method = 'mercado_pago' then 'mercado_pago'
                  when p.method = 'bank_transfer' then 'transferencia' else 'caja' end as method,
             sum(p.gross_amount)::bigint as amount
      from public.payments p where p.status = 'approved' and p.approved_at >= target_from and p.approved_at < target_to and p.gross_amount > 0
      group by 1) m), '[]'::jsonb),
    'clubs', jsonb_build_object(
      'count', (select count(*) from public.club_settings c where c.enabled),
      'members', (select count(*) from public.memberships m where m.status = 'active'),
      'overdue_members', (select count(distinct m.id) from public.memberships m join public.membership_dues d on d.membership_id = m.id
         where m.status = 'active' and d.paid_at is null and d.due_date < current_date)
    ),
    'upcoming', coalesce((select jsonb_agg(u order by u.starts_at) from (
      select e.id, e.name, e.starts_at, e.capacity, org.name as organization_name,
        (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'valid') as sold
      from public.events e join public.organizations org on org.id = e.organization_id
      where e.status in ('published', 'sold_out') and e.starts_at >= now() and e.starts_at < now() + interval '7 days'
      order by e.starts_at limit 8) u), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_list_events(target_scope text default 'upcoming', target_search text default null, target_org uuid default null, target_limit integer default 100)
returns table (event_id uuid, event_name text, event_slug text, status public.event_status, starts_at timestamptz, organization_id uuid, organization_name text,
  is_club boolean, capacity integer, tickets_sold bigint, sales_amount bigint, fee_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select e.id, e.name, e.slug, e.status, e.starts_at, org.id, org.name,
    exists (select 1 from public.club_settings c where c.organization_id = org.id and c.enabled),
    e.capacity,
    (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'valid'),
    coalesce((select sum(o.subtotal_amount) from public.orders o where o.event_id = e.id and o.status = 'paid' and not o.is_courtesy), 0)::bigint,
    coalesce((select sum(o.service_fee_amount) from public.orders o where o.event_id = e.id and o.status = 'paid' and not o.is_courtesy), 0)::bigint
  from public.events e join public.organizations org on org.id = e.organization_id
  where (target_org is null or e.organization_id = target_org)
    and (target_search is null or target_search = '' or e.name ilike '%' || target_search || '%' or org.name ilike '%' || target_search || '%')
    and case coalesce(target_scope, 'upcoming')
      when 'upcoming' then coalesce(e.ends_at, e.starts_at + interval '12 hours') >= now() and e.status <> 'cancelled'
      when 'past' then coalesce(e.ends_at, e.starts_at + interval '12 hours') < now()
      else true end
  order by case when coalesce(target_scope, 'upcoming') = 'upcoming' then e.starts_at end asc, e.starts_at desc
  limit least(greatest(coalesce(target_limit, 100), 1), 300);
end;
$$;

create or replace function public.admin_event_detail(target_event uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'name', e.name, 'slug', e.slug, 'status', e.status, 'starts_at', e.starts_at, 'capacity', e.capacity,
      'organization_id', org.id, 'organization_name', org.name, 'service_fee_bps', org.service_fee_bps,
      'is_club', exists (select 1 from public.club_settings c where c.organization_id = org.id and c.enabled)),
    'sales', coalesce((select sum(o.subtotal_amount) from public.orders o where o.event_id = e.id and o.status = 'paid' and not o.is_courtesy), 0),
    'fees', coalesce((select sum(o.service_fee_amount) from public.orders o where o.event_id = e.id and o.status = 'paid' and not o.is_courtesy), 0),
    'orders', (select count(*) from public.orders o where o.event_id = e.id and o.status = 'paid' and not o.is_courtesy),
    'courtesies', (select count(*) from public.tickets t join public.orders o on o.id = t.order_id where t.event_id = e.id and t.status = 'valid' and o.is_courtesy),
    'tickets_sold', (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'valid'),
    'tickets_used', (select count(*) from public.tickets t where t.event_id = e.id and t.status = 'valid' and t.used_entries > 0),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', m.method, 'amount', m.amount, 'orders', m.orders)) from (
      select case when p.method is null or p.method = 'mercado_pago' then 'mercado_pago' when p.method = 'bank_transfer' then 'transferencia' else 'caja' end as method,
        sum(p.gross_amount)::bigint as amount, count(*) as orders
      from public.payments p join public.orders o on o.id = p.order_id
      where o.event_id = e.id and p.status = 'approved' and p.gross_amount > 0 group by 1) m), '[]'::jsonb),
    'by_ticket_type', coalesce((select jsonb_agg(jsonb_build_object('name', tt.name, 'price', tt.price_amount, 'quantity', tt.quantity,
        'sold', (select count(*) from public.tickets t where t.ticket_type_id = tt.id and t.status = 'valid')) order by tt.sort_order) from public.ticket_types tt where tt.event_id = e.id), '[]'::jsonb),
    'transfers_pending', (select count(*) from public.payments p join public.orders o on o.id = p.order_id where o.event_id = e.id and p.method = 'bank_transfer' and p.status = 'processing')
  ) into result
  from public.events e join public.organizations org on org.id = e.organization_id where e.id = target_event;
  return result;
end;
$$;

create or replace function public.admin_clubs_overview()
returns table (organization_id uuid, club_name text, slug text, members_active bigint, members_overdue bigint, listing_status text,
  collection_mode text, requests_pending bigint, payouts_pending_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select org.id, coalesce(nullif(c.brand_name, ''), org.name), org.slug,
    (select count(*) from public.memberships m where m.organization_id = org.id and m.status = 'active'),
    (select count(distinct m.id) from public.memberships m join public.membership_dues d on d.membership_id = m.id
      where m.organization_id = org.id and m.status = 'active' and d.paid_at is null and d.due_date < current_date),
    c.public_listing_status, org.club_collection_mode,
    (select count(*) from public.club_membership_requests r where r.organization_id = org.id and r.status = 'pending'),
    coalesce((select sum(cp.amount) from public.club_payouts cp where cp.organization_id = org.id and cp.status = 'pending'), 0)::bigint
  from public.club_settings c join public.organizations org on org.id = c.organization_id
  where c.enabled
  order by 4 desc, 2;
end;
$$;

create or replace function public.admin_club_detail(target_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select jsonb_build_object(
    'club', jsonb_build_object('id', org.id, 'name', coalesce(nullif(c.brand_name, ''), org.name), 'slug', org.slug, 'listing_status', c.public_listing_status,
      'collection_mode', org.club_collection_mode, 'dues_fee_bps', org.club_dues_fee_bps, 'debt_blocks_entry', c.debt_blocks_entry,
      'has_payout_details', (c.payout_alias is not null or c.payout_cbu is not null)),
    'members_active', (select count(*) from public.memberships m where m.organization_id = org.id and m.status = 'active'),
    'members_suspended', (select count(*) from public.memberships m where m.organization_id = org.id and m.status = 'suspended'),
    'members_overdue', (select count(distinct m.id) from public.memberships m join public.membership_dues d on d.membership_id = m.id
      where m.organization_id = org.id and m.status = 'active' and d.paid_at is null and d.due_date < current_date),
    'requests_pending', (select count(*) from public.club_membership_requests r where r.organization_id = org.id and r.status = 'pending'),
    'overdue_amount', coalesce((select sum(d.amount) from public.membership_dues d join public.memberships m on m.id = d.membership_id
      where m.organization_id = org.id and d.paid_at is null and d.due_date < current_date), 0),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', cat.name, 'members', (select count(*) from public.memberships m where m.membership_category_id = cat.id and m.status = 'active')) order by cat.sort_order)
      from public.membership_categories cat where cat.organization_id = org.id and cat.active), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(x order by x.month) from (
      select to_char(date_trunc('month', d.period), 'YYYY-MM') as month, sum(d.amount)::bigint as billed,
        coalesce(sum(d.paid_amount) filter (where d.paid_at is not null), 0)::bigint as collected
      from public.membership_dues d where d.organization_id = org.id and d.period >= date_trunc('month', current_date) - interval '5 months'
      group by 1) x), '[]'::jsonb),
    'events_total', (select count(*) from public.events e where e.organization_id = org.id),
    'events_upcoming', (select count(*) from public.events e where e.organization_id = org.id and e.status in ('published','sold_out') and e.starts_at >= now())
  ) into result
  from public.organizations org join public.club_settings c on c.organization_id = org.id where org.id = target_org;
  return result;
end;
$$;

create or replace function public.admin_list_producers()
returns table (organization_id uuid, organization_name text, slug text, is_club boolean, events_total bigint, events_upcoming bigint,
  sales_amount bigint, fee_amount bigint, transfer_enabled boolean, mp_connected boolean, owed_amount bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select org.id, org.name, org.slug,
    exists (select 1 from public.club_settings c where c.organization_id = org.id and c.enabled),
    (select count(*) from public.events e where e.organization_id = org.id),
    (select count(*) from public.events e where e.organization_id = org.id and e.status in ('published','sold_out') and e.starts_at >= now()),
    coalesce((select sum(o.subtotal_amount) from public.orders o where o.organization_id = org.id and o.status = 'paid' and not o.is_courtesy), 0)::bigint,
    coalesce((select sum(o.service_fee_amount) from public.orders o where o.organization_id = org.id and o.status = 'paid' and not o.is_courtesy), 0)::bigint,
    org.ticket_transfer_enabled,
    exists (select 1 from public.payment_accounts a where a.organization_id = org.id and a.provider = 'mercado_pago' and a.status = 'connected'),
    coalesce((select sum(s.subtotal_amount) from public.transfer_sales(org.id) s where s.payout_id is null or s.payout_status = 'pending'), 0)::bigint,
    org.created_at
  from public.organizations org
  order by 7 desc, org.name;
end;
$$;

revoke all on function public.admin_overview(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_list_events(text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_event_detail(uuid) from public, anon, authenticated;
revoke all on function public.admin_clubs_overview() from public, anon, authenticated;
revoke all on function public.admin_club_detail(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_producers() from public, anon, authenticated;
grant execute on function public.admin_overview(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_list_events(text, text, uuid, integer) to authenticated;
grant execute on function public.admin_event_detail(uuid) to authenticated;
grant execute on function public.admin_clubs_overview() to authenticated;
grant execute on function public.admin_club_detail(uuid) to authenticated;
grant execute on function public.admin_list_producers() to authenticated;

notify pgrst, 'reload schema';
