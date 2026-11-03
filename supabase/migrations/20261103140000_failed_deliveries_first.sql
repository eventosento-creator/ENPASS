-- En Ventas, las compras con el envío del mail fallido salen primero. Antes la lista mostraba solo las 50 más recientes y el aviso
-- "N envío pendiente" contaba todas las fallidas del evento: si la fallida era más vieja, no aparecía el botón Reenviar.
create or replace function public.get_event_ticket_sales(target_event uuid)
returns table (
  order_id uuid, order_public_id text, buyer_name text, buyer_email text,
  order_status public.order_status, total_amount bigint, currency char(3),
  ticket_count bigint, ticket_names text, delivery_status public.ticket_delivery_status, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare target_organization uuid;
begin
  select organization_id into target_organization from public.events where id = target_event;
  if target_organization is null or auth.uid() is null
    or not (public.can_manage_org(target_organization) or public.can_manage_event(target_event)) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    o.id, o.public_id, trim(c.first_name || ' ' || c.last_name), c.email, o.status, o.total_amount, o.currency,
    count(t.id), coalesce(string_agg(tt.name, ', ' order by tt.sort_order, t.unit_index), ''), d.status, o.created_at
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.tickets t on t.order_id = o.id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.ticket_deliveries d on d.order_id = o.id and d.kind = 'tickets' and d.channel = 'email'
  where o.event_id = target_event and o.status in ('paid', 'refunded')
  group by o.id, c.first_name, c.last_name, c.email, d.status
  order by (d.status = 'failed') desc nulls last, o.created_at desc
  limit 50;
end;
$$;
