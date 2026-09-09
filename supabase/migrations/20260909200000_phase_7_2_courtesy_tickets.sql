create function public.create_courtesy_checkout(
  target_event uuid,
  target_ticket_type uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  quantity integer
)
returns table (order_public_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  type_row public.ticket_types;
  customer_id uuid;
  order_id uuid;
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
  expiry timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into event_row from public.events where id = target_event;
  if not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if quantity < 1 or quantity > 10 then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;
  if char_length(trim(buyer_first_name)) < 1
    or char_length(trim(buyer_last_name)) < 1
    or buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_BUYER' using errcode = 'P0001';
  end if;

  select * into type_row from public.ticket_types
  where id = target_ticket_type and event_id = target_event and active
  for update;
  if not found then raise exception 'INVALID_TICKET_TYPE' using errcode = 'P0001'; end if;

  insert into public.customers (organization_id, first_name, last_name, email, phone, document)
  values (event_row.organization_id, trim(buyer_first_name), trim(buyer_last_name), lower(trim(buyer_email)), null, null)
  on conflict (organization_id, lower(email)) do update
  set first_name = excluded.first_name, last_name = excluded.last_name
  returning id into customer_id;

  insert into public.orders (
    public_id, organization_id, event_id, customer_id,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id,
    0, 0, 0, event_row.currency, expiry
  ) returning id into order_id;

  insert into public.order_items (
    organization_id, order_id, item_type, ticket_type_id, item_name,
    quantity, unit_price_amount, line_total_amount, currency
  ) values (
    event_row.organization_id, order_id, 'ticket', type_row.id, type_row.name || ' (Cortesía)',
    quantity, 0, 0, type_row.currency
  );

  insert into public.ticket_holds (
    organization_id, event_id, ticket_type_id, order_id, quantity, expires_at
  ) values (
    event_row.organization_id, target_event, type_row.id, order_id, quantity, expiry
  );

  return query select generated_public_id;
end;
$$;

revoke all on function public.create_courtesy_checkout(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_courtesy_checkout(uuid, uuid, text, text, text, integer) to authenticated;
