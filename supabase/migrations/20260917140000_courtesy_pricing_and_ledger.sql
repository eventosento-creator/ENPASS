-- Precio de cortesías (definido por el usuario, 2026-09-17): $200 al emitirse, $500 al
-- ingresar efectivamente al evento. Configurable por organización (no hardcodeado), con
-- esos valores como default. Cada cobro genera un movimiento 'adjustment' en el ledger
-- financiero (organización = productor), construyendo un saldo acumulado reconstruible.
-- Ver memoria "ENPASS pricing model" / "Financial/dev rules".
--
-- También distingue las cortesías del resto de las órdenes de forma explícita (antes solo
-- se inferían por total_amount = 0, lo que las confundía con entradas gratuitas normales),
-- y expone esa marca en el scanner para que el operador la vea en el momento del ingreso.

alter table public.organizations
  add column courtesy_issue_cost_amount bigint not null default 20000 check (courtesy_issue_cost_amount >= 0),
  add column courtesy_checkin_cost_amount bigint not null default 50000 check (courtesy_checkin_cost_amount >= 0);

alter table public.orders
  add column created_by uuid references auth.users(id) on delete set null,
  add column is_courtesy boolean not null default false;

create or replace function public.create_courtesy_checkout(
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
    public_id, organization_id, event_id, customer_id, channel,
    subtotal_amount, service_fee_amount, total_amount, currency, expires_at,
    created_by, is_courtesy
  ) values (
    generated_public_id, event_row.organization_id, target_event, customer_id, 'admin',
    0, 0, 0, event_row.currency, expiry,
    auth.uid(), true
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

create or replace function public.complete_free_order(target_order_public_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  active_ticket_holds bigint := 0;
  active_table_holds bigint := 0;
  courtesy_quantity bigint := 0;
  courtesy_cost bigint := 0;
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

  if order_row.is_courtesy then
    select coalesce(sum(oi.quantity), 0) into courtesy_quantity
    from public.order_items oi where oi.order_id = order_row.id;
    if courtesy_quantity > 0 then
      select o.courtesy_issue_cost_amount into courtesy_cost
      from public.organizations o where o.id = order_row.organization_id;
      if courtesy_cost > 0 then
        insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, event_id, description)
        values (order_row.organization_id, 'adjustment', -(courtesy_cost * courtesy_quantity), order_row.currency, order_row.id, order_row.event_id, 'Cortesía emitida (' || courtesy_quantity || ')');
      end if;
    end if;
  end if;

  return order_row.id;
end;
$$;

revoke all on function public.complete_free_order(text) from public, anon, authenticated;
grant execute on function public.complete_free_order(text) to service_role;

-- Cobro al ingreso: se dispara sobre CUALQUIER check-in válido (incluye los que hace
-- check_in_ticket y supervisor_manual_checkin/override), sin tener que duplicar la lógica
-- de facturación dentro de esas funciones. Solo cobra en la primera entrada válida de un
-- ticket de cortesía (entry_number = 1), para no cobrar de nuevo en reingresos de tickets
-- multi-entrada.
create function public.charge_courtesy_checkin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  courtesy_cost bigint := 0;
begin
  if new.result <> 'valid' or new.entry_number is distinct from 1 or new.ticket_id is null then
    return new;
  end if;
  select o.* into order_row
  from public.tickets t
  join public.orders o on o.id = t.order_id
  where t.id = new.ticket_id;
  if not found or not order_row.is_courtesy then
    return new;
  end if;
  select o.courtesy_checkin_cost_amount into courtesy_cost
  from public.organizations o where o.id = order_row.organization_id;
  if courtesy_cost > 0 then
    insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, event_id, description, metadata)
    values (order_row.organization_id, 'adjustment', -courtesy_cost, order_row.currency, order_row.id, new.event_id, 'Cortesía ingresada', jsonb_build_object('checkin_id', new.id, 'ticket_id', new.ticket_id));
  end if;
  return new;
end;
$$;

create trigger checkins_charge_courtesy
  after insert on public.checkins
  for each row execute function public.charge_courtesy_checkin();

-- Marca is_courtesy en el resultado del scanner principal, para que el operador vea que
-- es una cortesía (y no una entrada vendida) en el momento del escaneo.
create function public.is_courtesy_ticket(target_ticket uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.is_courtesy, false)
  from public.tickets t
  join public.orders o on o.id = t.order_id
  where t.id = target_ticket;
$$;

drop function public.check_in_ticket(text, text, uuid);

create function public.check_in_ticket(
  target_session_hash text,
  target_qr_hash text,
  target_idempotency_key uuid
)
returns table (
  result public.checkin_result,
  checkin_id uuid,
  ticket_id uuid,
  holder_name text,
  ticket_type_name text,
  sector text,
  short_code text,
  used_entries integer,
  max_entries integer,
  first_used_at timestamptz,
  first_used_gate_name text,
  valid_from timestamptz,
  valid_until timestamptz,
  suggested_gate_name text,
  scanned_at timestamptz,
  is_courtesy boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_now timestamptz := clock_timestamp();
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  event_row public.events;
  gate_row public.access_gates;
  ticket_row public.tickets;
  prior_checkin public.checkins;
  outcome public.checkin_result := 'device_not_authorized'::public.checkin_result;
  created_checkin_id uuid;
  entry_number_value integer;
  ticket_type_name_value text;
  holder_name_value text;
  first_used_value timestamptz;
  first_used_gate_value text;
  suggested_gate_value text;
  session_is_valid boolean := false;
  ticket_is_found boolean := false;
  is_courtesy_value boolean := false;
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select c.* into prior_checkin
  from public.checkins c
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  where c.idempotency_key = target_idempotency_key
    and (s.session_token_hash = target_session_hash or c.scanner_session_id is null)
  limit 1;
  if found then
    if prior_checkin.ticket_id is not null then
      select * into ticket_row from public.tickets where id = prior_checkin.ticket_id;
      ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
      holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
      is_courtesy_value := public.is_courtesy_ticket(ticket_row.id);
      select c.scanned_at, g.name into first_used_value, first_used_gate_value
      from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
      where c.ticket_id = ticket_row.id and c.result = 'valid'
      order by c.scanned_at limit 1;
      if prior_checkin.result = 'wrong_gate' then
        suggested_gate_value := public.get_access_credential_suggested_gate(ticket_row.id);
      end if;
    end if;
    return query select prior_checkin.result, prior_checkin.id, prior_checkin.ticket_id,
      case when prior_checkin.result in ('valid', 'already_used') then holder_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
      case when prior_checkin.result in ('valid', 'already_used') then ticket_row.short_code else null end,
      ticket_row.used_entries, ticket_row.max_entries, first_used_value, first_used_gate_value,
      ticket_row.valid_from, ticket_row.valid_until, suggested_gate_value, prior_checkin.scanned_at,
      is_courtesy_value;
    return;
  end if;

  if target_session_hash ~ '^[0-9a-f]{64}$' then
    select * into session_row from public.scanner_sessions
    where session_token_hash = target_session_hash for update;
    if found then
      select * into authorization_row from public.scanner_device_authorizations
      where id = session_row.authorization_id for update;
      select * into event_row from public.events where id = session_row.event_id;
      select * into gate_row from public.access_gates where id = session_row.access_gate_id;
      session_is_valid := authorization_row.id is not null
        and session_row.revoked_at is null and session_row.expires_at > effective_now
        and authorization_row.revoked_at is null
        and event_row.status in ('published', 'sold_out') and gate_row.active;
    end if;
  end if;
  if not session_is_valid then
    outcome := 'device_not_authorized';
  else
    update public.scanner_sessions
    set last_seen_at = effective_now,
        scan_window_started_at = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then effective_now
          else scan_window_started_at end,
        scan_attempts = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then 1
          else scan_attempts + 1 end
    where id = session_row.id returning * into session_row;
    if session_row.scan_attempts > 60 then
      return query select 'rate_limited'::public.checkin_result, null::uuid, null::uuid,
        null::text, null::text, null::text, null::text, null::integer, null::integer,
        null::timestamptz, null::text, null::timestamptz, null::timestamptz,
        null::text, effective_now, null::boolean;
      return;
    end if;
    if target_qr_hash !~ '^[0-9a-f]{64}$' then
      outcome := 'invalid';
    else
      select * into ticket_row from public.tickets where qr_token_hash = target_qr_hash for update;
      ticket_is_found := found;
      if not ticket_is_found then outcome := 'invalid';
      elsif ticket_row.organization_id <> session_row.organization_id
        or ticket_row.event_id <> session_row.event_id then outcome := 'wrong_event';
      elsif ticket_row.status = 'cancelled' then outcome := 'cancelled';
      elsif ticket_row.status = 'refunded' then outcome := 'refunded';
      elsif effective_now < ticket_row.valid_from then outcome := 'too_early';
      elsif effective_now > ticket_row.valid_until then outcome := 'too_late';
      elsif not public.access_credential_allows_gate(ticket_row.id, session_row.access_gate_id) then
        outcome := 'wrong_gate';
        suggested_gate_value := public.get_access_credential_suggested_gate(ticket_row.id);
      elsif ticket_row.used_entries >= ticket_row.max_entries then
        outcome := 'already_used';
        select c.scanned_at, g.name into first_used_value, first_used_gate_value
        from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
        where c.ticket_id = ticket_row.id and c.result = 'valid'
        order by c.scanned_at limit 1;
      else
        outcome := 'valid';
        entry_number_value := ticket_row.used_entries + 1;
        update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
        ticket_row.used_entries := entry_number_value;
      end if;
    end if;
  end if;
  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, scanned_at
  ) values (
    case when session_row.id is not null then session_row.organization_id else null end,
    case when session_row.id is not null then session_row.event_id else null end,
    case when ticket_is_found then ticket_row.id else null end,
    case when session_row.id is not null then session_row.access_gate_id else null end,
    case when session_row.id is not null then session_row.id else null end,
    outcome, 'qr', entry_number_value, target_idempotency_key, effective_now
  ) returning id into created_checkin_id;
  if ticket_is_found and ticket_row.event_id = session_row.event_id then
    ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
    holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
    is_courtesy_value := public.is_courtesy_ticket(ticket_row.id);
  end if;
  if outcome = 'valid' and entry_number_value > 1 then
    select c.scanned_at, g.name into first_used_value, first_used_gate_value
    from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
    where c.ticket_id = ticket_row.id and c.result = 'valid'
    order by c.scanned_at limit 1;
  end if;
  return query select outcome, created_checkin_id,
    case when ticket_is_found then ticket_row.id else null end,
    case when outcome in ('valid', 'already_used') then holder_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
    case when outcome in ('valid', 'already_used') then ticket_row.short_code else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.used_entries else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.max_entries else null end,
    first_used_value, first_used_gate_value,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_from else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_until else null end,
    suggested_gate_value, effective_now, is_courtesy_value;
end;
$$;

revoke all on function public.check_in_ticket(text, text, uuid) from public, anon, authenticated;
grant execute on function public.check_in_ticket(text, text, uuid) to service_role;
