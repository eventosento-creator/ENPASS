-- La lista de eventos de admin acepta un rango de fechas del evento (desde/hasta). Con rango, reemplaza a "próximos/pasados/todos".
-- Mismas columnas de siempre; las llamadas con 4 parámetros siguen funcionando porque los dos nuevos tienen valor por defecto.
drop function if exists public.admin_list_events(text, text, uuid, integer);

create function public.admin_list_events(
  target_scope text default 'upcoming', target_search text default null, target_org uuid default null, target_limit integer default 100,
  target_from timestamptz default null, target_to timestamptz default null
)
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
    and case
      when target_from is not null and target_to is not null then e.starts_at >= target_from and e.starts_at < target_to
      else case coalesce(target_scope, 'upcoming')
        when 'upcoming' then coalesce(e.ends_at, e.starts_at + interval '12 hours') >= now() and e.status <> 'cancelled'
        when 'past' then coalesce(e.ends_at, e.starts_at + interval '12 hours') < now()
        else true end
      end
  order by case when (target_from is not null and target_to is not null) or coalesce(target_scope, 'upcoming') = 'upcoming' then e.starts_at end asc, e.starts_at desc
  limit least(greatest(coalesce(target_limit, 100), 1), 300);
end;
$$;

revoke all on function public.admin_list_events(text, text, uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_list_events(text, text, uuid, integer, timestamptz, timestamptz) to authenticated;
