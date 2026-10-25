-- Entradas nominales: cada entrada de una compra puede tener su propio titular (nombre, apellido y, si el evento lo pide, DNI).
-- Antes todas las entradas de una compra salían con el nombre del comprador, así que la lista de la puerta no decía quién viene.
--
-- * Al comprar se guardan los titulares de cada entrada (order_ticket_holders) DESPUÉS de crear la orden, igual que los cupones:
--   no se toca la lógica de precios ni de pagos.
-- * Al emitir las entradas (issue_tickets_for_paid_order) cada una toma su titular; si no hay (órdenes viejas, cortesías, taquilla,
--   RRPP) usa los datos del comprador como hasta ahora.
-- * El comprador puede cambiar el nombre de una entrada propia hasta 3 horas antes del evento (update_ticket_holder); queda auditado.

create table if not exists public.order_ticket_holders (
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  unit_index integer not null check (unit_index >= 1),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  document text check (document is null or document ~ '^[0-9]{7,8}$'),
  created_at timestamptz not null default now(),
  primary key (order_item_id, unit_index)
);
create index if not exists order_ticket_holders_order_idx on public.order_ticket_holders(order_id);
alter table public.order_ticket_holders enable row level security;
revoke all on public.order_ticket_holders from public, anon, authenticated;
grant select, insert, delete on public.order_ticket_holders to service_role;

-- Guarda los titulares de una orden pendiente. Exige uno por cada entrada (ningún lugar sin nombre) y nunca más que la cantidad comprada.
create or replace function public.set_order_ticket_holders(target_order_public_id text, target_holders jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  expected integer;
  holder jsonb;
  item_row public.order_items;
  inserted integer := 0;
begin
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'pending' then raise exception 'ORDER_NOT_PENDING' using errcode = 'P0001'; end if;
  if jsonb_typeof(target_holders) <> 'array' then raise exception 'INVALID_HOLDERS' using errcode = 'P0001'; end if;
  select coalesce(sum(quantity), 0)::integer into expected from public.order_items where order_id = order_row.id and item_type = 'ticket';
  if expected < 1 or jsonb_array_length(target_holders) <> expected then raise exception 'HOLDERS_INCOMPLETE' using errcode = 'P0001'; end if;

  delete from public.order_ticket_holders where order_id = order_row.id;
  for holder in select * from jsonb_array_elements(target_holders) loop
    select * into item_row from public.order_items
    where order_id = order_row.id and item_type = 'ticket' and ticket_type_id = (holder->>'ticket_type_id')::uuid;
    if not found or (holder->>'unit_index') !~ '^[1-9][0-9]*$' or (holder->>'unit_index')::integer > item_row.quantity then
      raise exception 'INVALID_HOLDERS' using errcode = 'P0001';
    end if;
    insert into public.order_ticket_holders (order_id, order_item_id, unit_index, first_name, last_name, document)
    values (order_row.id, item_row.id, (holder->>'unit_index')::integer, trim(holder->>'first_name'), trim(holder->>'last_name'),
      nullif(regexp_replace(coalesce(holder->>'document', ''), '[^0-9]', '', 'g'), ''));
    inserted := inserted + 1;
  end loop;
  -- Si se repitió una posición quedó otra sin cubrir: la cuenta final tiene que ser exacta.
  if (select count(*) from public.order_ticket_holders where order_id = order_row.id) <> expected then
    raise exception 'HOLDERS_INCOMPLETE' using errcode = 'P0001';
  end if;
  return inserted;
end;
$$;

-- Cambio de titular de una entrada por su comprador. Solo entradas válidas y sin usar, hasta 3 horas antes del evento.
create or replace function public.update_ticket_holder(target_ticket uuid, target_customer_ids uuid[], target_first_name text, target_last_name text, target_document text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ticket_row public.tickets;
  event_row public.events;
  clean_first text := trim(coalesce(target_first_name, ''));
  clean_last text := trim(coalesce(target_last_name, ''));
  clean_doc text := nullif(regexp_replace(coalesce(target_document, ''), '[^0-9]', '', 'g'), '');
begin
  select * into ticket_row from public.tickets where id = target_ticket for update;
  if not found or ticket_row.customer_id is null or not (ticket_row.customer_id = any(coalesce(target_customer_ids, '{}'::uuid[]))) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if ticket_row.ticket_type_id is null then raise exception 'NOT_EDITABLE' using errcode = 'P0001'; end if;
  if ticket_row.status <> 'valid' or ticket_row.used_entries > 0 then raise exception 'NOT_EDITABLE' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = ticket_row.event_id;
  if event_row.status in ('finished', 'cancelled') or event_row.starts_at - interval '3 hours' <= now() then raise exception 'EDIT_WINDOW_CLOSED' using errcode = 'P0001'; end if;
  if char_length(clean_first) not between 1 and 80 or char_length(clean_last) not between 1 and 80 then raise exception 'INVALID_NAME' using errcode = 'P0001'; end if;
  if clean_doc is not null and clean_doc !~ '^[0-9]{7,8}$' then raise exception 'INVALID_DOCUMENT' using errcode = 'P0001'; end if;
  if event_row.require_document and clean_doc is null then raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001'; end if;

  update public.tickets set holder_first_name = clean_first, holder_last_name = clean_last,
    holder_document = case when event_row.require_document or clean_doc is not null then clean_doc else holder_document end
  where id = ticket_row.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, before_data, after_data)
  values (ticket_row.organization_id, 'ticket.holder.changed', 'ticket', ticket_row.id,
    jsonb_build_object('name', trim(ticket_row.holder_first_name || ' ' || ticket_row.holder_last_name)),
    jsonb_build_object('name', trim(clean_first || ' ' || clean_last), 'event_id', ticket_row.event_id));
end;
$$;

revoke all on function public.set_order_ticket_holders(text, jsonb) from public, anon, authenticated;
revoke all on function public.update_ticket_holder(uuid, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.set_order_ticket_holders(text, jsonb) to service_role;
grant execute on function public.update_ticket_holder(uuid, uuid[], text, text, text) to service_role;

create or replace function public.issue_tickets_for_paid_order(target_order_id uuid, credentials jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  order_row public.orders;
  event_row public.events;
  customer_row public.customers;
  item_row public.order_items;
  table_row public.event_tables;
  seat_row public.event_seats;
  seat_section_row public.seat_map_sections;
  zone_name text;
  credential jsonb;
  expected_count integer;
  inserted_count integer := 0;
  existing_count integer := 0;
  final_count integer;
  final_entitlement_count integer;
begin
  if jsonb_typeof(credentials) <> 'array' then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;
  select * into order_row from public.orders where id = target_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'paid' then raise exception 'ORDER_NOT_PAID' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = order_row.event_id;
  select * into customer_row from public.customers where id = order_row.customer_id;
  select coalesce(sum(case when item_type = 'ticket' then quantity else 1 end), 0)::integer
  into expected_count from public.order_items where order_id = order_row.id;
  if expected_count < 1 or jsonb_array_length(credentials) <> expected_count then
    raise exception 'INVALID_TICKET_CREDENTIAL_COUNT' using errcode = 'P0001';
  end if;
  if (
    select count(*) from (
      select value->>'order_item_id', value->>'unit_index'
      from jsonb_array_elements(credentials)
      group by value->>'order_item_id', value->>'unit_index'
    ) supplied_units
  ) <> expected_count then
    raise exception 'DUPLICATE_TICKET_CREDENTIAL_UNIT' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(credentials) supplied(value)
    left join public.order_items oi
      on oi.id::text = supplied.value->>'order_item_id' and oi.order_id = order_row.id
    where oi.id is null
      or supplied.value->>'unit_index' !~ '^[1-9][0-9]*$'
      or (supplied.value->>'unit_index')::integer > case when oi.item_type = 'ticket' then oi.quantity else 1 end
      or supplied.value->>'qr_token_hash' !~ '^[0-9a-f]{64}$'
      or char_length(coalesce(supplied.value->>'qr_token_encrypted', '')) < 32
      or supplied.value->>'short_code' !~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$'
  ) then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;

  for item_row in
    select * from public.order_items where order_id = order_row.id order by id for update
  loop
    if item_row.item_type = 'ticket' then
      for unit_number in 1..item_row.quantity loop
        if exists (
          select 1 from public.tickets
          where order_item_id = item_row.id and unit_index = unit_number
        ) then
          existing_count := existing_count + 1;
          continue;
        end if;
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = unit_number;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, ticket_type_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, valid_from, valid_until, short_code,
          qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          item_row.ticket_type_id, order_row.customer_id, unit_number,
          coalesce((select h.first_name from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = unit_number), customer_row.first_name),
          coalesce((select h.last_name from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = unit_number), customer_row.last_name),
          case when exists (select 1 from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = unit_number)
            then (select h.document from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = unit_number)
            else customer_row.document end,
          coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end loop;
    elsif item_row.item_type = 'seat' then
      select * into seat_row from public.event_seats es where es.id = item_row.event_seat_id for update;
      if seat_row.id is null then raise exception 'EVENT_SEAT_NOT_FOUND' using errcode = 'P0001'; end if;
      select s.name into zone_name from public.seat_map_sections s where s.id = seat_row.section_id;
      if exists (select 1 from public.tickets where order_item_id = item_row.id and unit_index = 1) then
        existing_count := existing_count + 1;
      else
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = 1;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, event_seat_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, valid_from, valid_until, sector,
          short_code, qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          seat_row.id, order_row.customer_id, 1,
          customer_row.first_name, customer_row.last_name, customer_row.document,
          coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          zone_name || ' · ' || seat_row.label,
          credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end if;
    else
      select * into table_row
      from public.event_tables et
      where et.id = item_row.event_table_id for update;
      if table_row.id is null then raise exception 'EVENT_TABLE_NOT_FOUND' using errcode = 'P0001'; end if;
      select z.name into zone_name from public.table_zones z where z.id = table_row.table_zone_id;
      if exists (select 1 from public.tickets where order_item_id = item_row.id and unit_index = 1) then
        existing_count := existing_count + 1;
      else
        select value into credential from jsonb_array_elements(credentials)
        where value->>'order_item_id' = item_row.id::text
          and (value->>'unit_index')::integer = 1;
        insert into public.tickets (
          organization_id, event_id, order_id, order_item_id, event_table_id,
          customer_id, unit_index, holder_first_name, holder_last_name,
          holder_document, max_entries, valid_from, valid_until, sector,
          short_code, qr_token_hash, qr_token_encrypted
        ) values (
          order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
          table_row.id, order_row.customer_id, 1,
          customer_row.first_name, customer_row.last_name, customer_row.document,
          table_row.capacity, coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          zone_name, credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end if;
      insert into public.entitlements (
        organization_id, event_id, order_id, order_item_id, event_table_id,
        entitlement_type, name, quantity, metadata
      ) values (
        order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
        table_row.id, 'access', 'Acceso', table_row.capacity,
        jsonb_build_object('credential_mode', 'group')
      ) on conflict (order_item_id) where entitlement_type = 'access' do nothing;
      insert into public.entitlements (
        organization_id, event_id, order_id, order_item_id, event_table_id,
        template_id, entitlement_type, reference_id, name, quantity, metadata
      )
      select order_row.organization_id, order_row.event_id, order_row.id, item_row.id,
        table_row.id, template.id, template.entitlement_type, template.reference_id,
        template.name, template.quantity, template.metadata
      from public.table_entitlement_templates template
      where template.event_table_id = table_row.id
      on conflict (order_item_id, template_id) where template_id is not null do nothing;
    end if;
  end loop;

  select count(*)::integer into final_count from public.tickets where order_id = order_row.id;
  if final_count <> expected_count then
    raise exception 'TICKET_ISSUANCE_INCOMPLETE' using errcode = 'P0001';
  end if;
  select count(*)::integer into final_entitlement_count
  from public.entitlements where order_id = order_row.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  select order_row.organization_id, 'table.fulfilled', 'event_table', item.event_table_id,
    jsonb_build_object('order_id', order_row.id, 'order_item_id', item.id)
  from public.order_items item
  where item.order_id = order_row.id and item.item_type = 'table'
    and not exists (
      select 1 from public.audit_logs log
      where log.action = 'table.fulfilled' and log.entity_id = item.event_table_id
        and log.after_data->>'order_id' = order_row.id::text
    );
  return jsonb_build_object(
    'order_id', order_row.id, 'expected_count', expected_count,
    'inserted_count', inserted_count, 'existing_count', existing_count,
    'ticket_count', final_count, 'entitlement_count', final_entitlement_count
  );
end;
$function$;

notify pgrst, 'reload schema';
