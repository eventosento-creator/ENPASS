create function public.complete_free_order(target_order_public_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  active_ticket_holds bigint := 0;
  active_table_holds bigint := 0;
begin
  select * into order_row
  from public.orders
  where public_id = target_order_public_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if order_row.total_amount <> 0 then
    raise exception 'ORDER_NOT_FREE' using errcode = 'P0001';
  end if;
  if order_row.status = 'paid' then
    return order_row.id;
  end if;
  if order_row.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING' using errcode = 'P0001';
  end if;
  if order_row.expires_at <= now() then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where order_id = order_row.id) then
    raise exception 'FREE_ORDER_PAYMENT_EXISTS' using errcode = 'P0001';
  end if;

  perform 1 from public.events where id = order_row.event_id for update;
  perform 1 from public.ticket_holds
  where order_id = order_row.id order by id for update;
  perform 1 from public.table_holds
  where order_id = order_row.id order by id for update;

  select count(*) into active_ticket_holds
  from public.ticket_holds
  where order_id = order_row.id and status = 'active' and expires_at > now();
  select count(*) into active_table_holds
  from public.table_holds
  where order_id = order_row.id and status = 'active' and expires_at > now();

  if active_ticket_holds + active_table_holds = 0 then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.ticket_holds
    where order_id = order_row.id and (status <> 'active' or expires_at <= now())
  ) or exists (
    select 1 from public.table_holds
    where order_id = order_row.id and (status <> 'active' or expires_at <= now())
  ) then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;

  update public.ticket_holds set status = 'consumed'
  where order_id = order_row.id and status = 'active';
  update public.table_holds set status = 'consumed'
  where order_id = order_row.id and status = 'active';
  update public.orders set status = 'paid' where id = order_row.id;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values
    (order_row.organization_id, 'order.free_confirmed', 'order', order_row.id,
      jsonb_build_object('total_amount', 0, 'currency', order_row.currency)),
    (order_row.organization_id, 'order.paid', 'order', order_row.id,
      jsonb_build_object('source', 'free_checkout'));

  return order_row.id;
end;
$$;

revoke all on function public.complete_free_order(text) from public, anon, authenticated;
grant execute on function public.complete_free_order(text) to service_role;

create or replace function public.get_public_events_discovery()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  cover_image_url text,
  starts_at timestamptz,
  currency char(3),
  venue_name text,
  venue_address text,
  city text,
  province text,
  timezone text,
  from_price_amount bigint,
  has_availability boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id, e.slug, e.name, e.description, e.cover_image_url, e.starts_at, e.currency,
    v.name, v.address, v.city, v.province, v.timezone,
    case
      when ticket_inventory.from_price is null then table_inventory.from_price
      when table_inventory.from_price is null then ticket_inventory.from_price
      else least(ticket_inventory.from_price, table_inventory.from_price)
    end,
    coalesce(ticket_inventory.available, false) or coalesce(table_inventory.available, false)
  from public.events e
  join public.venues v on v.id = e.venue_id
  left join lateral (
    select min(t.price_amount) filter (where t.sale_open) as from_price,
      coalesce(bool_or(t.sale_open), false) as available
    from public.get_public_ticket_types(e.id) t
  ) ticket_inventory on true
  left join lateral (
    select min(t.base_price_amount) filter (
        where t.availability_status = 'available'
      ) as from_price,
      coalesce(bool_or(t.availability_status = 'available'), false) as available
    from public.get_public_event_tables(e.id) t
  ) table_inventory on true
  where e.status = 'published' and e.starts_at > now()
  order by e.starts_at asc;
$$;

revoke all on function public.get_public_events_discovery() from public, anon, authenticated;
grant execute on function public.get_public_events_discovery() to anon, authenticated;
