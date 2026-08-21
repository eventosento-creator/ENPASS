drop function public.get_public_order(text);

create function public.get_public_order(target_public_id text)
returns table (
  public_id text,
  event_name text,
  event_slug text,
  event_cover_url text,
  status public.order_status,
  subtotal_amount bigint,
  service_fee_amount bigint,
  total_amount bigint,
  currency char(3),
  expires_at timestamptz,
  items jsonb
)
language sql stable security definer set search_path = '' as $$
  select o.public_id, e.name, e.slug, e.cover_image_url,
    case when o.status = 'pending' and o.expires_at <= now() then 'expired'::public.order_status else o.status end,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.currency, o.expires_at,
    coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'quantity', i.quantity, 'unit_price_amount', i.unit_price_amount) order by i.created_at), '[]'::jsonb)
  from public.orders o
  join public.events e on e.id = o.event_id
  join public.order_items i on i.order_id = o.id
  where o.public_id = target_public_id
  group by o.id, e.name, e.slug, e.cover_image_url;
$$;

revoke all on function public.get_public_order(text) from public;
grant execute on function public.get_public_order(text) to anon, authenticated;

drop policy if exists event_covers_member_update on storage.objects;
create policy event_covers_member_update on storage.objects
for update to authenticated
using (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] in (
    select organization_id::text from public.organization_members where user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'event-covers'
  and (storage.foldername(name))[1] in (
    select organization_id::text from public.organization_members where user_id = (select auth.uid())
  )
);
