create type public.ticket_status as enum ('valid', 'cancelled', 'refunded');
create type public.ticket_delivery_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  unit_index integer not null check (unit_index > 0),
  status public.ticket_status not null default 'valid',
  holder_first_name text not null check (char_length(holder_first_name) between 1 and 120),
  holder_last_name text not null check (char_length(holder_last_name) between 1 and 120),
  holder_document text,
  max_entries integer not null default 1 check (max_entries > 0),
  used_entries integer not null default 0 check (used_entries >= 0 and used_entries <= max_entries),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  sector text,
  short_code text not null unique check (short_code ~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$'),
  qr_token_hash text not null unique check (qr_token_hash ~ '^[0-9a-f]{64}$'),
  qr_token_encrypted text not null check (char_length(qr_token_encrypted) >= 32),
  issued_at timestamptz not null default now(),
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id, unit_index),
  check (valid_until > valid_from),
  check ((status = 'cancelled' and cancelled_at is not null) or status <> 'cancelled'),
  check ((status = 'refunded' and refunded_at is not null) or status <> 'refunded')
);

create table public.ticket_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null default 'tickets' check (kind = 'tickets'),
  channel text not null default 'email' check (channel = 'email'),
  destination_hash text not null check (destination_hash ~ '^[0-9a-f]{64}$'),
  status public.ticket_delivery_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind, channel)
);

create table public.buyer_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  exchanged_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.buyer_access_token_customers (
  access_token_id uuid not null references public.buyer_access_tokens(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  primary key (access_token_id, customer_id)
);

create table public.buyer_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.buyer_session_customers (
  buyer_session_id uuid not null references public.buyer_sessions(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  primary key (buyer_session_id, customer_id)
);

create index tickets_organization_event_idx on public.tickets (organization_id, event_id);
create index tickets_event_status_idx on public.tickets (event_id, status);
create index tickets_order_idx on public.tickets (order_id);
create index tickets_ticket_type_idx on public.tickets (ticket_type_id);
create index tickets_customer_idx on public.tickets (customer_id, issued_at desc);
create index ticket_deliveries_organization_event_idx on public.ticket_deliveries (organization_id, event_id);
create index ticket_deliveries_status_idx on public.ticket_deliveries (status, last_attempt_at);
create index buyer_access_tokens_expiry_idx on public.buyer_access_tokens (expires_at)
  where exchanged_at is null and revoked_at is null;
create index buyer_access_token_customers_customer_idx on public.buyer_access_token_customers (customer_id);
create index buyer_sessions_expiry_idx on public.buyer_sessions (expires_at) where revoked_at is null;
create index buyer_session_customers_customer_idx on public.buyer_session_customers (customer_id);

create trigger tickets_touch before update on public.tickets
for each row execute function public.touch_updated_at();
create trigger ticket_deliveries_touch before update on public.ticket_deliveries
for each row execute function public.touch_updated_at();

alter table public.tickets enable row level security;
alter table public.ticket_deliveries enable row level security;
alter table public.buyer_access_tokens enable row level security;
alter table public.buyer_access_token_customers enable row level security;
alter table public.buyer_sessions enable row level security;
alter table public.buyer_session_customers enable row level security;

create policy tickets_manager_select on public.tickets
for select to authenticated using ((select public.can_manage_org(organization_id)));

create policy ticket_deliveries_manager_select on public.ticket_deliveries
for select to authenticated using ((select public.can_manage_org(organization_id)));

grant select (
  id, organization_id, event_id, order_id, order_item_id, ticket_type_id,
  customer_id, unit_index, status, holder_first_name, holder_last_name,
  holder_document, max_entries, used_entries, valid_from, valid_until, sector,
  short_code, issued_at, cancelled_at, refunded_at, created_at, updated_at
) on public.tickets to authenticated;

grant select (
  id, organization_id, event_id, order_id, kind, channel, destination_hash,
  status, attempts, last_attempt_at, sent_at, last_error, created_at, updated_at
) on public.ticket_deliveries to authenticated;

create function public.issue_tickets_for_paid_order(
  target_order_id uuid,
  credentials jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  event_row public.events;
  customer_row public.customers;
  item_row public.order_items;
  credential jsonb;
  expected_count integer;
  inserted_count integer := 0;
  existing_count integer := 0;
  final_count integer;
begin
  if jsonb_typeof(credentials) <> 'array' then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;

  select * into order_row
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if order_row.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID' using errcode = 'P0001';
  end if;

  select * into event_row from public.events where id = order_row.event_id;
  select * into customer_row from public.customers where id = order_row.customer_id;

  select coalesce(sum(quantity), 0)::integer into expected_count
  from public.order_items
  where order_id = order_row.id;

  if expected_count < 1 or jsonb_array_length(credentials) <> expected_count then
    raise exception 'INVALID_TICKET_CREDENTIAL_COUNT' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from (
      select value->>'order_item_id' as order_item_id, value->>'unit_index' as unit_index
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
      on oi.id::text = supplied.value->>'order_item_id'
      and oi.order_id = order_row.id
    where oi.id is null
      or supplied.value->>'unit_index' !~ '^[1-9][0-9]*$'
      or (supplied.value->>'unit_index')::integer > oi.quantity
      or supplied.value->>'qr_token_hash' !~ '^[0-9a-f]{64}$'
      or char_length(coalesce(supplied.value->>'qr_token_encrypted', '')) < 32
      or supplied.value->>'short_code' !~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$'
  ) then
    raise exception 'INVALID_TICKET_CREDENTIALS' using errcode = 'P0001';
  end if;

  for item_row in
    select * from public.order_items
    where order_id = order_row.id
    order by id
  loop
    for unit_number in 1..item_row.quantity loop
      if exists (
        select 1 from public.tickets
        where order_item_id = item_row.id and unit_index = unit_number
      ) then
        existing_count := existing_count + 1;
        continue;
      end if;

      select value into credential
      from jsonb_array_elements(credentials)
      where value->>'order_item_id' = item_row.id::text
        and (value->>'unit_index')::integer = unit_number;

      insert into public.tickets (
        organization_id, event_id, order_id, order_item_id, ticket_type_id,
        customer_id, unit_index, holder_first_name, holder_last_name,
        holder_document, valid_from, valid_until, short_code,
        qr_token_hash, qr_token_encrypted
      ) values (
        order_row.organization_id,
        order_row.event_id,
        order_row.id,
        item_row.id,
        item_row.ticket_type_id,
        order_row.customer_id,
        unit_number,
        customer_row.first_name,
        customer_row.last_name,
        customer_row.document,
        coalesce(event_row.doors_open_at, event_row.starts_at),
        coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
        credential->>'short_code',
        credential->>'qr_token_hash',
        credential->>'qr_token_encrypted'
      );

      insert into public.audit_logs (
        organization_id, action, entity_type, entity_id, after_data
      ) values (
        order_row.organization_id,
        'ticket.issued',
        'ticket',
        (select id from public.tickets where order_item_id = item_row.id and unit_index = unit_number),
        jsonb_build_object(
          'order_id', order_row.id,
          'order_item_id', item_row.id,
          'unit_index', unit_number
        )
      );

      inserted_count := inserted_count + 1;
    end loop;
  end loop;

  select count(*)::integer into final_count
  from public.tickets
  where order_id = order_row.id;

  if final_count <> expected_count then
    raise exception 'TICKET_ISSUANCE_INCOMPLETE' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'order_id', order_row.id,
    'expected_count', expected_count,
    'inserted_count', inserted_count,
    'existing_count', existing_count,
    'ticket_count', final_count
  );
end;
$$;

create function public.claim_ticket_delivery(
  target_order_id uuid,
  target_destination_hash text,
  force_delivery boolean default false
)
returns table (delivery_id uuid, should_send boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  delivery_row public.ticket_deliveries;
  expected_count integer;
  issued_count integer;
begin
  if target_destination_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DESTINATION_HASH' using errcode = 'P0001';
  end if;

  select * into order_row from public.orders where id = target_order_id for update;
  if not found or order_row.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0)::integer into expected_count
  from public.order_items where order_id = order_row.id;
  select count(*)::integer into issued_count
  from public.tickets where order_id = order_row.id;
  if issued_count <> expected_count then
    raise exception 'TICKETS_NOT_READY' using errcode = 'P0001';
  end if;

  insert into public.ticket_deliveries (
    organization_id, event_id, order_id, destination_hash
  ) values (
    order_row.organization_id, order_row.event_id, order_row.id, target_destination_hash
  ) on conflict (order_id, kind, channel) do nothing;

  select * into delivery_row
  from public.ticket_deliveries
  where order_id = order_row.id and kind = 'tickets' and channel = 'email'
  for update;

  if not force_delivery and delivery_row.status = 'sent' then
    return query select delivery_row.id, false;
    return;
  end if;

  if not force_delivery
    and delivery_row.status = 'processing'
    and delivery_row.last_attempt_at > now() - interval '5 minutes' then
    return query select delivery_row.id, false;
    return;
  end if;

  update public.ticket_deliveries
  set status = 'processing',
      destination_hash = target_destination_hash,
      attempts = attempts + 1,
      last_attempt_at = now(),
      last_error = null
  where id = delivery_row.id;

  return query select delivery_row.id, true;
end;
$$;

create function public.complete_ticket_delivery(
  target_delivery_id uuid,
  succeeded boolean,
  error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.ticket_deliveries;
begin
  select * into delivery_row
  from public.ticket_deliveries
  where id = target_delivery_id
  for update;

  if not found then
    raise exception 'DELIVERY_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.ticket_deliveries
  set status = case when succeeded then 'sent'::public.ticket_delivery_status else 'failed'::public.ticket_delivery_status end,
      sent_at = case when succeeded then now() else sent_at end,
      last_error = case when succeeded then null else left(coalesce(error_message, 'delivery_failed'), 500) end
  where id = target_delivery_id;

  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    delivery_row.organization_id,
    case when succeeded then 'ticket.delivery.sent' else 'ticket.delivery.failed' end,
    'ticket_delivery',
    delivery_row.id,
    jsonb_build_object('order_id', delivery_row.order_id, 'attempt', delivery_row.attempts)
  );
end;
$$;

create function public.create_buyer_access_token(
  target_email text,
  target_token_hash text,
  target_email_hash text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_id uuid;
  normalized_email text := lower(trim(target_email));
  calculated_email_hash text;
  organization_row record;
begin
  calculated_email_hash := encode(
    extensions.digest(convert_to(normalized_email, 'UTF8'), 'sha256'),
    'hex'
  );

  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_email_hash <> calculated_email_hash
    or target_expires_at <= now()
    or target_expires_at > now() + interval '30 minutes' then
    raise exception 'INVALID_BUYER_ACCESS_REQUEST' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.customers c
    join public.tickets t on t.customer_id = c.id
    join public.orders o on o.id = t.order_id and o.status in ('paid', 'refunded')
    where lower(c.email) = normalized_email
  ) then
    return null;
  end if;

  insert into public.buyer_access_tokens (token_hash, email_hash, expires_at)
  values (target_token_hash, target_email_hash, target_expires_at)
  returning id into access_id;

  insert into public.buyer_access_token_customers (access_token_id, customer_id)
  select distinct access_id, c.id
  from public.customers c
  join public.tickets t on t.customer_id = c.id
  join public.orders o on o.id = t.order_id and o.status in ('paid', 'refunded')
  where lower(c.email) = normalized_email;

  for organization_row in
    select distinct c.organization_id
    from public.customers c
    join public.buyer_access_token_customers link on link.customer_id = c.id
    where link.access_token_id = access_id
  loop
    insert into public.audit_logs (organization_id, action, entity_type, entity_id)
    values (organization_row.organization_id, 'buyer.magic_link.requested', 'buyer_access_token', access_id);
  end loop;

  return access_id;
end;
$$;

create function public.exchange_buyer_access_token(
  target_token_hash text,
  target_session_hash text,
  target_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_row public.buyer_access_tokens;
  session_id uuid;
  organization_row record;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$'
    or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_session_expires_at <= now()
    or target_session_expires_at > now() + interval '31 days' then
    return false;
  end if;

  select * into access_row
  from public.buyer_access_tokens
  where token_hash = target_token_hash
  for update;

  if not found or access_row.expires_at <= now()
    or access_row.exchanged_at is not null or access_row.revoked_at is not null then
    return false;
  end if;

  insert into public.buyer_sessions (session_hash, expires_at)
  values (target_session_hash, target_session_expires_at)
  returning id into session_id;

  insert into public.buyer_session_customers (buyer_session_id, customer_id)
  select session_id, customer_id
  from public.buyer_access_token_customers
  where access_token_id = access_row.id;

  update public.buyer_access_tokens set exchanged_at = now() where id = access_row.id;

  for organization_row in
    select distinct c.organization_id
    from public.customers c
    join public.buyer_session_customers link on link.customer_id = c.id
    where link.buyer_session_id = session_id
  loop
    insert into public.audit_logs (organization_id, action, entity_type, entity_id)
    values (organization_row.organization_id, 'buyer.access.granted', 'buyer_session', session_id);
  end loop;

  return true;
end;
$$;

create function public.get_buyer_session_customers(target_session_hash text)
returns table (customer_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  update public.buyer_sessions
  set last_used_at = now()
  where session_hash = target_session_hash
    and revoked_at is null
    and expires_at > now()
  returning id into session_id;

  if session_id is null then
    return;
  end if;

  return query
  select link.customer_id
  from public.buyer_session_customers link
  where link.buyer_session_id = session_id;
end;
$$;

create function public.revoke_buyer_session(target_session_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.buyer_sessions
  set revoked_at = coalesce(revoked_at, now())
  where session_hash = target_session_hash;
$$;

create function public.cancel_ticket(target_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_row public.tickets;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into ticket_row from public.tickets where id = target_ticket for update;
  if not found or not public.can_manage_org(ticket_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if ticket_row.status = 'valid' then
    update public.tickets
    set status = 'cancelled', cancelled_at = now()
    where id = ticket_row.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      ticket_row.organization_id,
      auth.uid(),
      'ticket.cancelled',
      'ticket',
      ticket_row.id,
      jsonb_build_object('status', ticket_row.status),
      jsonb_build_object('status', 'cancelled')
    );
  end if;
end;
$$;

create function public.refund_tickets_after_order_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  refunded_ticket record;
begin
  if new.status = 'refunded' and old.status is distinct from new.status then
    for refunded_ticket in
      update public.tickets
      set status = 'refunded', refunded_at = coalesce(refunded_at, now())
      where order_id = new.id and status <> 'refunded'
      returning id, organization_id
    loop
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        refunded_ticket.organization_id,
        'ticket.refunded',
        'ticket',
        refunded_ticket.id,
        jsonb_build_object('order_id', new.id)
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_refund_tickets
after update of status on public.orders
for each row execute function public.refund_tickets_after_order_refund();

create function public.get_event_ticket_metrics(target_event uuid)
returns table (
  tickets_issued bigint,
  paid_orders bigint,
  delivery_failures bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_organization uuid;
begin
  select organization_id into target_organization
  from public.events where id = target_event;

  if target_organization is null or auth.uid() is null
    or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  select
    (select count(*) from public.tickets t where t.event_id = target_event),
    (select count(*) from public.orders o where o.event_id = target_event and o.status = 'paid'),
    (
      select count(*) from public.ticket_deliveries d
      where d.event_id = target_event and d.status = 'failed'
    );
end;
$$;

create function public.get_event_ticket_sales(target_event uuid)
returns table (
  order_id uuid,
  order_public_id text,
  buyer_name text,
  buyer_email text,
  order_status public.order_status,
  total_amount bigint,
  currency char(3),
  ticket_count bigint,
  ticket_names text,
  delivery_status public.ticket_delivery_status,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_organization uuid;
begin
  select organization_id into target_organization
  from public.events where id = target_event;

  if target_organization is null or auth.uid() is null
    or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  select
    o.id,
    o.public_id,
    trim(c.first_name || ' ' || c.last_name),
    c.email,
    o.status,
    o.total_amount,
    o.currency,
    count(t.id),
    coalesce(string_agg(tt.name, ', ' order by tt.sort_order, t.unit_index), ''),
    d.status,
    o.created_at
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.tickets t on t.order_id = o.id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.ticket_deliveries d
    on d.order_id = o.id and d.kind = 'tickets' and d.channel = 'email'
  where o.event_id = target_event and o.status in ('paid', 'refunded')
  group by o.id, c.first_name, c.last_name, c.email, d.status
  order by o.created_at desc
  limit 50;
end;
$$;

create or replace function public.get_dashboard_sales_metrics(target_organization uuid)
returns table (
  confirmed_orders bigint,
  confirmed_tickets bigint,
  pending_reservations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  select
    (select count(*) from public.orders o where o.organization_id = target_organization and o.status = 'paid'),
    (
      select count(*)
      from public.tickets t
      join public.orders o on o.id = t.order_id
      where t.organization_id = target_organization and o.status = 'paid'
    ),
    (
      select coalesce(sum(h.quantity), 0)
      from public.ticket_holds h
      where h.organization_id = target_organization
        and h.status = 'active'
        and h.expires_at > now()
    );
end;
$$;

revoke all on function public.issue_tickets_for_paid_order(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_ticket_delivery(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_ticket_delivery(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.create_buyer_access_token(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.exchange_buyer_access_token(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_buyer_session_customers(text) from public, anon, authenticated;
revoke all on function public.revoke_buyer_session(text) from public, anon, authenticated;
revoke all on function public.cancel_ticket(uuid) from public, anon, authenticated;
revoke all on function public.refund_tickets_after_order_refund() from public, anon, authenticated;
revoke all on function public.get_event_ticket_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_ticket_sales(uuid) from public, anon, authenticated;

grant execute on function public.issue_tickets_for_paid_order(uuid, jsonb) to service_role;
grant execute on function public.claim_ticket_delivery(uuid, text, boolean) to service_role;
grant execute on function public.complete_ticket_delivery(uuid, boolean, text) to service_role;
grant execute on function public.create_buyer_access_token(text, text, text, timestamptz) to service_role;
grant execute on function public.exchange_buyer_access_token(text, text, timestamptz) to service_role;
grant execute on function public.get_buyer_session_customers(text) to service_role;
grant execute on function public.revoke_buyer_session(text) to service_role;
grant execute on function public.cancel_ticket(uuid) to authenticated;
grant execute on function public.get_event_ticket_metrics(uuid) to authenticated;
grant execute on function public.get_event_ticket_sales(uuid) to authenticated;

-- Supabase no longer auto-exposes newly created tables. The server-only client
-- needs explicit, narrow table privileges in addition to service_role's RLS bypass.
grant select on public.organizations, public.venues, public.events, public.ticket_types,
  public.customers, public.orders, public.order_items, public.payment_accounts,
  public.payments, public.tickets to service_role;
grant select, insert, update on public.payment_accounts, public.webhook_events to service_role;
grant insert on public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
