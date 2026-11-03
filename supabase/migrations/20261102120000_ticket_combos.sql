-- Combos con varios ingresos: un tipo de entrada puede dar N ingresos por compra (un QR por persona).
--
-- * ticket_types.entries_per_unit (1 = entrada normal). El precio es el del combo entero y el cargo se calcula sobre ese precio.
-- * El cupo del tipo y el aforo del evento cuentan PERSONAS: la reserva (ticket_holds.quantity) guarda combos * ingresos, así todo lo que
--   ya suma reservas (aforo, reembolsos, contracargos) sigue siendo correcto sin tocarlo. ticket_types.quantity es el cupo en personas.
-- * get_public_ticket_types / get_link_ticket_type devuelven available_quantity en COMBOS disponibles (personas libres / ingresos), con las
--   mismas columnas de siempre, por lo que la página, la taquilla y la página por link muestran el stock correcto sin cambios.
-- * Al pagar se emiten quantity * entries_per_unit entradas; cada una toma el nombre del titular de su combo (el comprador puede cambiarlo).
-- * Las cortesías no soportan combos (cada una se cobra como una entrada): se rechazan.

alter table public.ticket_types
  add column if not exists entries_per_unit integer not null default 1 check (entries_per_unit between 1 and 20);

-- Tamaño de los combos del evento (solo los de más de un ingreso), para mostrar "incluye N ingresos".
create or replace function public.get_event_combo_sizes(target_event uuid)
returns table (ticket_type_id uuid, entries_per_unit integer)
language sql stable security definer set search_path = '' as $$
  select t.id, t.entries_per_unit from public.ticket_types t
  join public.events e on e.id = t.event_id and e.status = 'published'
  where t.event_id = target_event and t.active and t.entries_per_unit > 1;
$$;
revoke all on function public.get_event_combo_sizes(uuid) from public, anon, authenticated;
grant execute on function public.get_event_combo_sizes(uuid) to anon, authenticated, service_role;

create or replace function public.get_public_ticket_types(target_event uuid)
returns table (
  id uuid, organization_id uuid, event_id uuid, name text, description text,
  price_amount bigint, currency char(3), quantity integer, max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, active boolean, sort_order integer,
  available_quantity bigint, sale_open boolean
)
language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      (greatest(t.quantity - coalesce(sum(h.quantity) filter (
        where h.status = 'consumed' or (h.status = 'active' and h.expires_at > now())
      ), 0), 0) / t.entries_per_unit)::bigint as available,
      coalesce(p.sort_order, t.sort_order) as phase_order
    from public.ticket_types t
    left join public.sale_phases p on p.id = t.sale_phase_id
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published' and e.tickets_enabled
    where t.event_id = target_event and t.active and t.publicly_available and not t.link_only
    group by t.id, p.sort_order
  ), open_phase as (
    select min(phase_order) as phase_order from inventory where available > 0
  )
  select i.id, i.organization_id, i.event_id, i.name, i.description, i.price_amount, i.currency,
    i.quantity, i.max_per_order, i.sales_start, i.sales_end, i.active, i.sort_order, i.available,
    (i.available > 0 and i.phase_order = o.phase_order
      and (i.sales_start is null or i.sales_start <= now())
      and (i.sales_end is null or i.sales_end > now()))
  from inventory i cross join open_phase o
  order by i.phase_order, i.sort_order;
$$;

create or replace function public.get_link_ticket_type(target_event uuid, target_token text)
returns table (
  id uuid, name text, description text, price_amount bigint, currency char(3), max_per_order integer,
  sales_start timestamptz, sales_end timestamptz, available_quantity bigint, sale_state text, sale_open boolean
) language sql stable security definer set search_path = '' as $$
  with inventory as (
    select t.*,
      (greatest(t.quantity - coalesce(sum(h.quantity) filter (
        where h.status = 'consumed' or (h.status = 'active' and h.expires_at > now())
      ), 0), 0) / t.entries_per_unit)::bigint as available
    from public.ticket_types t
    left join public.ticket_holds h on h.ticket_type_id = t.id
    join public.events e on e.id = t.event_id and e.status = 'published' and e.tickets_enabled
    where t.event_id = target_event and t.link_only and t.active
      and target_token is not null and t.link_token = target_token
    group by t.id
  )
  select i.id, i.name, i.description, i.price_amount, i.currency, i.max_per_order, i.sales_start, i.sales_end, i.available,
    case
      when i.sales_start is not null and i.sales_start > now() then 'upcoming'
      when i.sales_end is not null and i.sales_end <= now() then 'ended'
      when i.available <= 0 then 'sold_out'
      else 'open'
    end,
    (i.available > 0 and (i.sales_start is null or i.sales_start <= now()) and (i.sales_end is null or i.sales_end > now()))
  from inventory i;
$$;

create or replace function public.create_guest_checkout_internal(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb,
  accepted_terms_document_id uuid,
  accepted_refund_policy_document_id uuid
)
returns table (order_public_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  org_row public.organizations;
  customer_id uuid;
  order_id uuid;
  selection jsonb;
  selected_type public.order_item_type;
  selected_id uuid;
  type_row public.ticket_types;
  table_row public.event_tables;
  seat_row public.event_seats;
  seat_section_row public.seat_map_sections;
  requested integer;
  type_reserved bigint;
  event_reserved bigint;
  ticket_subtotal bigint := 0;
  table_subtotal bigint := 0;
  table_fee bigint := 0;
  seat_subtotal bigint := 0;
  seat_fee bigint := 0;
  subtotal bigint := 0;
  fee bigint := 0;
  expiry timestamptz := now() + interval '10 minutes';
  generated_public_id text := encode(extensions.gen_random_bytes(16), 'hex');
  terms_doc public.legal_documents;
  refund_doc public.legal_documents;
begin
  select * into terms_doc from public.legal_documents
  where id = accepted_terms_document_id and type = 'terms_buyer' and status = 'active';
  if not found then raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = 'P0001'; end if;
  select * into refund_doc from public.legal_documents
  where id = accepted_refund_policy_document_id and type = 'refund_policy' and status = 'active';
  if not found then raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = 'P0001'; end if;

  if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) = 0
    or jsonb_array_length(selections) > 20 then
    raise exception 'EMPTY_SELECTION' using errcode = 'P0001';
  end if;
  if (
    select count(*) <> count(distinct (
      coalesce(selected_item->>'item_type', case when selected_item ? 'ticket_type_id' then 'ticket' else '' end)
      || ':' || coalesce(selected_item->>'item_id', selected_item->>'ticket_type_id', '')
    ))
    from jsonb_array_elements(selections) selected_item
  ) then
    raise exception 'DUPLICATE_SELECTION' using errcode = 'P0001';
  end if;
  if char_length(trim(buyer_first_name)) < 1
    or char_length(trim(buyer_last_name)) < 1
    or buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_BUYER' using errcode = 'P0001';
  end if;

  select * into event_row
  from public.events
  where id = target_event and status = 'published'
  for update;
  if not found then raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0001'; end if;
  if event_row.require_document and nullif(trim(buyer_document), '') is null then
    raise exception 'DOCUMENT_REQUIRED' using errcode = 'P0001';
  end if;
  select * into org_row from public.organizations where id = event_row.organization_id;

  update public.ticket_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.table_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.seat_holds h
  set status = 'expired'
  where h.event_id = target_event and h.status = 'active' and h.expires_at <= now();
  update public.orders o
  set status = 'expired'
  where o.event_id = target_event and o.status = 'pending' and o.expires_at <= now();

  select
    coalesce((
      select sum(h.quantity) from public.ticket_holds h
      where h.event_id = target_event
        and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()))
    ), 0)
    + coalesce((
      select sum(et.capacity)
      from public.table_holds h
      join public.event_tables et on et.id = h.event_table_id
      where h.event_id = target_event
        and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
    ), 0)
    + coalesce((
      select count(*)
      from public.seat_holds h
      where h.event_id = target_event
        and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
    ), 0)
  into event_reserved;

  for selection in
    select value from jsonb_array_elements(selections)
    order by coalesce(value->>'item_id', value->>'ticket_type_id')
  loop
    begin
      selected_type := coalesce(
        (selection->>'item_type')::public.order_item_type,
        case when selection ? 'ticket_type_id' then 'ticket'::public.order_item_type else null end
      );
      selected_id := coalesce(selection->>'item_id', selection->>'ticket_type_id')::uuid;
      requested := (selection->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_SELECTION' using errcode = 'P0001';
    end;

    if selected_type = 'ticket' then
      select * into type_row
      from public.ticket_types
      where id = selected_id and event_id = target_event and active and publicly_available
        and (not link_only or (nullif(selection->>'link_token', '') is not null and link_token = selection->>'link_token'))
      for update;
      if not found or requested < 1 or requested > type_row.max_per_order then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if type_row.sales_start is not null and type_row.sales_start > now() then
        raise exception 'SALES_NOT_STARTED' using errcode = 'P0001';
      end if;
      if type_row.sales_end is not null and type_row.sales_end <= now() then
        raise exception 'SALES_ENDED' using errcode = 'P0001';
      end if;
      select coalesce(sum(h.quantity), 0) into type_reserved
      from public.ticket_holds h
      where h.ticket_type_id = type_row.id
        and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()));
      if type_reserved + requested * type_row.entries_per_unit > type_row.quantity then
        raise exception 'TICKET_TYPE_SOLD_OUT' using errcode = 'P0001';
      end if;
      if not type_row.link_only and not exists (
        select 1 from public.get_public_ticket_types(target_event) public_type
        where public_type.id = type_row.id and public_type.sale_open
      ) then
        raise exception 'TICKET_TYPE_NOT_OPEN' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + requested * type_row.entries_per_unit;
      ticket_subtotal := ticket_subtotal + type_row.price_amount * requested;
    elsif selected_type = 'table' then
      select * into table_row
      from public.event_tables
      where id = selected_id and event_id = target_event and active
      for update;
      if not found or requested <> 1 then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.table_holds h
        where h.event_table_id = table_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ) then
        raise exception 'TABLE_UNAVAILABLE' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + table_row.capacity;
      table_subtotal := table_subtotal + table_row.base_price_amount;
      table_fee := table_fee + round(
        table_row.base_price_amount
        * coalesce(table_row.service_fee_bps, org_row.table_service_fee_bps, org_row.service_fee_bps)::numeric
        / 10000
      )::bigint;
    elsif selected_type = 'seat' then
      select * into seat_row
      from public.event_seats
      where id = selected_id and event_id = target_event and active
      for update;
      if not found or requested <> 1 then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      select * into seat_section_row from public.seat_map_sections where id = seat_row.section_id and active;
      if not found then
        raise exception 'INVALID_SELECTION' using errcode = 'P0001';
      end if;
      if exists (
        select 1 from public.seat_holds h
        where h.event_seat_id = seat_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ) then
        raise exception 'SEAT_UNAVAILABLE' using errcode = 'P0001';
      end if;
      event_reserved := event_reserved + 1;
      seat_subtotal := seat_subtotal + seat_section_row.base_price_amount;
      seat_fee := seat_fee + round(
        seat_section_row.base_price_amount
        * coalesce(seat_section_row.service_fee_bps, org_row.table_service_fee_bps, org_row.service_fee_bps)::numeric
        / 10000
      )::bigint;
    else
      raise exception 'INVALID_SELECTION' using errcode = 'P0001';
    end if;
    if event_reserved > event_row.capacity then
      raise exception 'EVENT_SOLD_OUT' using errcode = 'P0001';
    end if;
  end loop;

  subtotal := ticket_subtotal + table_subtotal + seat_subtotal;
  if org_row.fee_payer = 'buyer' then
    fee := round(ticket_subtotal * org_row.service_fee_bps::numeric / 10000)::bigint + table_fee + seat_fee;
  end if;

  insert into public.customers (
    organization_id, first_name, last_name, email, phone, document
  ) values (
    event_row.organization_id, trim(buyer_first_name), trim(buyer_last_name),
    lower(trim(buyer_email)), nullif(trim(buyer_phone), ''), nullif(trim(buyer_document), '')
  )
  on conflict (organization_id, lower(email)) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = coalesce(excluded.phone, public.customers.phone),
      document = coalesce(excluded.document, public.customers.document)
  returning id into customer_id;

  insert into public.orders (
    public_id, organization_id, event_id, customer_id,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id,
    subtotal, fee, subtotal + fee, event_row.currency, expiry
  ) returning id into order_id;

  insert into public.legal_acceptances (legal_document_id, order_id, email, source)
  values
    (terms_doc.id, order_id, lower(trim(buyer_email)), 'checkout'),
    (refund_doc.id, order_id, lower(trim(buyer_email)), 'checkout');

  for selection in
    select value from jsonb_array_elements(selections)
    order by coalesce(value->>'item_id', value->>'ticket_type_id')
  loop
    selected_type := coalesce(
      (selection->>'item_type')::public.order_item_type,
      case when selection ? 'ticket_type_id' then 'ticket'::public.order_item_type else null end
    );
    selected_id := coalesce(selection->>'item_id', selection->>'ticket_type_id')::uuid;
    requested := (selection->>'quantity')::integer;
    if selected_type = 'ticket' then
      select * into type_row from public.ticket_types where id = selected_id;
      insert into public.order_items (
        organization_id, order_id, item_type, ticket_type_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'ticket', type_row.id, type_row.name,
        requested, type_row.price_amount, type_row.price_amount * requested, type_row.currency
      );
      insert into public.ticket_holds (
        organization_id, event_id, ticket_type_id, order_id, quantity, expires_at
      ) values (
        event_row.organization_id, target_event, type_row.id, order_id, requested * type_row.entries_per_unit, expiry
      );
    elsif selected_type = 'table' then
      select * into table_row from public.event_tables where id = selected_id;
      insert into public.order_items (
        organization_id, order_id, item_type, event_table_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'table', table_row.id, table_row.name,
        1, table_row.base_price_amount, table_row.base_price_amount, table_row.currency
      );
      insert into public.table_holds (
        organization_id, event_id, event_table_id, order_id, expires_at
      ) values (
        event_row.organization_id, target_event, table_row.id, order_id, expiry
      );
    else
      select * into seat_row from public.event_seats where id = selected_id;
      select * into seat_section_row from public.seat_map_sections where id = seat_row.section_id;
      insert into public.order_items (
        organization_id, order_id, item_type, event_seat_id, item_name,
        quantity, unit_price_amount, line_total_amount, currency
      ) values (
        event_row.organization_id, order_id, 'seat', seat_row.id,
        seat_section_row.name || ' · ' || seat_row.label,
        1, seat_section_row.base_price_amount, seat_section_row.base_price_amount, seat_section_row.currency
      );
      insert into public.seat_holds (
        organization_id, event_id, event_seat_id, order_id, expires_at
      ) values (
        event_row.organization_id, target_event, seat_row.id, order_id, expiry
      );
    end if;
  end loop;

  return query select generated_public_id, expiry;
end;
$$;

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
  entries integer;
begin
  if jsonb_typeof(credentials) <> 'array' then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;
  select * into order_row from public.orders where id = target_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'paid' then raise exception 'ORDER_NOT_PAID' using errcode = 'P0001'; end if;
  select * into event_row from public.events where id = order_row.event_id;
  select * into customer_row from public.customers where id = order_row.customer_id;
  select coalesce(sum(case when oi.item_type = 'ticket' then oi.quantity * coalesce(tt.entries_per_unit, 1) else 1 end), 0)::integer
  into expected_count from public.order_items oi left join public.ticket_types tt on tt.id = oi.ticket_type_id where oi.order_id = order_row.id;
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
      or (supplied.value->>'unit_index')::integer > case when oi.item_type = 'ticket' then oi.quantity * coalesce((select tt.entries_per_unit from public.ticket_types tt where tt.id = oi.ticket_type_id), 1) else 1 end
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
      entries := coalesce((select tt.entries_per_unit from public.ticket_types tt where tt.id = item_row.ticket_type_id), 1);
      for unit_number in 1..item_row.quantity * entries loop
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
          coalesce((select h.first_name from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = ((unit_number - 1) / entries) + 1), customer_row.first_name),
          coalesce((select h.last_name from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = ((unit_number - 1) / entries) + 1), customer_row.last_name),
          case when exists (select 1 from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = ((unit_number - 1) / entries) + 1)
            then (select h.document from public.order_ticket_holders h where h.order_item_id = item_row.id and h.unit_index = ((unit_number - 1) / entries) + 1)
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

-- Cortesías: rename-and-wrap (idempotente). La emisión de cortesías cuenta una entrada por unidad, así que un combo se rechaza.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_courtesy_checkout_combo_phase') then
    alter function public.create_courtesy_checkout(uuid, uuid, text, text, text, integer) rename to create_courtesy_checkout_combo_phase;
  end if;
end $$;

create or replace function public.create_courtesy_checkout(
  target_event uuid, target_ticket_type uuid, buyer_first_name text, buyer_last_name text, buyer_email text, quantity integer
) returns table (order_public_id text) language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.ticket_types where id = target_ticket_type and entries_per_unit > 1) then
    raise exception 'COMBO_NOT_SUPPORTED' using errcode = 'P0001';
  end if;
  return query select * from public.create_courtesy_checkout_combo_phase(target_event, target_ticket_type, buyer_first_name, buyer_last_name, buyer_email, quantity);
end;
$$;
revoke all on function public.create_courtesy_checkout_combo_phase(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_courtesy_checkout(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_courtesy_checkout(uuid, uuid, text, text, text, integer) to authenticated;

-- Duplicar evento: la copia conserva el tamaño de los combos (rename-and-wrap, repetible).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'duplicate_event_phase_8') then
    alter function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean)
    rename to duplicate_event_phase_8;
  end if;
end;
$$;

create or replace function public.duplicate_event_with_options(
  target_event uuid, target_name text, target_slug text, target_starts_at timestamptz,
  preserve_tickets boolean, preserve_promoters boolean, preserve_tables boolean,
  preserve_products boolean, preserve_sales_locations boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_event_id uuid;
begin
  new_event_id := public.duplicate_event_phase_8(
    target_event, target_name, target_slug, target_starts_at,
    preserve_tickets, preserve_promoters, preserve_tables, preserve_products, preserve_sales_locations
  );
  if preserve_tickets then
    update public.ticket_types copy set entries_per_unit = source.entries_per_unit
    from public.ticket_types source
    where source.event_id = target_event and copy.event_id = new_event_id and copy.name = source.name;
  end if;
  return new_event_id;
end;
$$;
revoke all on function public.duplicate_event_phase_8(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
