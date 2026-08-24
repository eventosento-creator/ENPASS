create or replace function public.process_payment_update(
  target_payment_public_id text,
  target_provider_payment_id text,
  target_status public.payment_status,
  target_provider_status text,
  target_provider_status_detail text,
  target_gross_amount bigint,
  target_currency char(3),
  target_processor_fee_amount bigint,
  target_seller_net_amount bigint,
  target_approved_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  order_row public.orders;
  event_row public.events;
  approved_payment_id uuid;
  required_ticket_entries bigint := 0;
  required_table_entries bigint := 0;
  event_used bigint := 0;
  inventory_conflict boolean := false;
  hold_group record;
  table_hold_group record;
begin
  if target_status not in (
    'pending', 'processing', 'approved', 'rejected', 'cancelled',
    'refunded', 'partially_refunded', 'charged_back'
  ) then
    raise exception 'INVALID_PROVIDER_STATUS' using errcode = 'P0001';
  end if;

  select * into payment_row from public.payments
  where public_id = target_payment_public_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into order_row from public.orders where id = payment_row.order_id for update;
  select * into event_row from public.events where id = order_row.event_id for update;

  if exists (
    select 1 from public.payments p
    where p.provider = payment_row.provider
      and p.provider_payment_id = target_provider_payment_id
      and p.id <> payment_row.id
  ) then
    update public.payments
    set status = 'error', requires_action = true, exception_code = 'provider_payment_conflict'
    where id = payment_row.id;
    return 'provider_payment_conflict';
  end if;
  if target_gross_amount <> payment_row.gross_amount or target_currency <> payment_row.currency then
    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
        provider_status = target_provider_status,
        provider_status_detail = target_provider_status_detail,
        status = 'error', requires_action = true,
        exception_code = 'amount_or_currency_mismatch'
    where id = payment_row.id;
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values (
      payment_row.organization_id, 'payment.amount_mismatch', 'payment', payment_row.id,
      jsonb_build_object('expected_amount', payment_row.gross_amount, 'received_amount', target_gross_amount)
    );
    return 'amount_or_currency_mismatch';
  end if;
  if payment_row.status in (
    'approved', 'refunded', 'partially_refunded', 'charged_back',
    'approved_inventory_conflict', 'approved_duplicate_charge'
  ) and target_status in ('pending', 'processing', 'rejected', 'cancelled') then
    return 'ignored_stale_update';
  end if;

  if target_status = 'approved' then
    select p.id into approved_payment_id
    from public.payments p
    where p.order_id = order_row.id and p.id <> payment_row.id and p.status = 'approved'
    limit 1;
    if order_row.status = 'paid' then
      if payment_row.status = 'approved' and approved_payment_id is null then
        update public.payments
        set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
            provider_status = target_provider_status,
            provider_status_detail = target_provider_status_detail,
            processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
            seller_net_amount = target_seller_net_amount,
            approved_at = coalesce(approved_at, target_approved_at, now())
        where id = payment_row.id;
        return 'already_approved';
      end if;
      update public.payments
      set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
          provider_status = target_provider_status,
          provider_status_detail = target_provider_status_detail,
          status = 'approved_duplicate_charge', requires_action = true,
          exception_code = 'order_already_paid',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id, 'payment.duplicate_charge', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id)
      );
      return 'approved_duplicate_charge';
    end if;

    update public.ticket_holds h set status = 'expired'
    where h.event_id = order_row.event_id and h.status = 'active' and h.expires_at <= now();
    update public.table_holds h set status = 'expired'
    where h.event_id = order_row.event_id and h.status = 'active' and h.expires_at <= now();
    update public.orders o set status = 'expired'
    where o.event_id = order_row.event_id and o.status = 'pending' and o.expires_at <= now();

    perform 1 from public.ticket_types t
    where t.id in (
      select h.ticket_type_id from public.ticket_holds h where h.order_id = order_row.id
    ) order by t.id for update;
    perform 1 from public.event_tables et
    where et.id in (
      select h.event_table_id from public.table_holds h where h.order_id = order_row.id
    ) order by et.id for update;

    select coalesce(sum(h.quantity), 0) into required_ticket_entries
    from public.ticket_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    select coalesce(sum(et.capacity), 0) into required_table_entries
    from public.table_holds h
    join public.event_tables et on et.id = h.event_table_id
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    if required_ticket_entries + required_table_entries = 0
      or order_row.status not in ('pending', 'expired') then
      inventory_conflict := true;
    end if;

    select
      coalesce((
        select sum(h.quantity) from public.ticket_holds h
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status = 'consumed' or (h.status = 'active' and h.expires_at > now()))
      ), 0)
      + coalesce((
        select sum(et.capacity)
        from public.table_holds h
        join public.event_tables et on et.id = h.event_table_id
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ), 0)
    into event_used;
    if event_used + required_ticket_entries + required_table_entries > event_row.capacity then
      inventory_conflict := true;
    end if;

    for hold_group in
      select h.ticket_type_id, sum(h.quantity)::bigint as required_quantity
      from public.ticket_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      group by h.ticket_type_id order by h.ticket_type_id
    loop
      if (
        select coalesce(sum(other_holds.quantity), 0)
        from public.ticket_holds other_holds
        where other_holds.ticket_type_id = hold_group.ticket_type_id
          and other_holds.order_id <> order_row.id
          and (other_holds.status = 'consumed'
            or (other_holds.status = 'active' and other_holds.expires_at > now()))
      ) + hold_group.required_quantity > (
        select t.quantity from public.ticket_types t where t.id = hold_group.ticket_type_id
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    for table_hold_group in
      select h.event_table_id
      from public.table_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      order by h.event_table_id
    loop
      if exists (
        select 1 from public.table_holds other_holds
        where other_holds.event_table_id = table_hold_group.event_table_id
          and other_holds.order_id <> order_row.id
          and (other_holds.status in ('consumed', 'refund_review')
            or (other_holds.status = 'active' and other_holds.expires_at > now()))
      ) then
        inventory_conflict := true;
      end if;
    end loop;

    if inventory_conflict then
      update public.payments
      set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
          provider_status = target_provider_status,
          provider_status_detail = target_provider_status_detail,
          status = 'approved_inventory_conflict', requires_action = true,
          exception_code = 'inventory_unavailable_after_approval',
          processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
          seller_net_amount = target_seller_net_amount,
          approved_at = coalesce(target_approved_at, now())
      where id = payment_row.id;
      update public.orders set status = 'expired'
      where id = order_row.id and status = 'pending';
      update public.ticket_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';
      update public.table_holds set status = 'expired'
      where order_id = order_row.id and status = 'active';
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        payment_row.organization_id, 'payment.approved_inventory_conflict', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id, 'requires_refund', true)
      );
      return 'approved_inventory_conflict';
    end if;

    update public.ticket_holds set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');
    update public.table_holds set status = 'consumed'
    where order_id = order_row.id and status in ('active', 'expired');
    update public.orders set status = 'paid' where id = order_row.id;
    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
        provider_status = target_provider_status,
        provider_status_detail = target_provider_status_detail,
        status = 'approved', requires_action = false, exception_code = null,
        processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
        seller_net_amount = target_seller_net_amount,
        approved_at = coalesce(target_approved_at, now())
    where id = payment_row.id;
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values
      (payment_row.organization_id, 'payment.approved', 'payment', payment_row.id,
        jsonb_build_object('order_id', order_row.id)),
      (payment_row.organization_id, 'order.paid', 'order', order_row.id,
        jsonb_build_object('payment_id', payment_row.id));
    return 'approved';
  end if;

  update public.payments
  set provider_payment_id = coalesce(provider_payment_id, target_provider_payment_id),
      provider_status = target_provider_status,
      provider_status_detail = target_provider_status_detail,
      status = target_status,
      requires_action = target_status in ('partially_refunded', 'charged_back'),
      processor_fee_amount = greatest(coalesce(target_processor_fee_amount, 0), 0),
      seller_net_amount = target_seller_net_amount,
      rejected_at = case when target_status = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
      refunded_at = case when target_status = 'refunded' then coalesce(refunded_at, now()) else refunded_at end
  where id = payment_row.id;
  if target_status = 'refunded' and order_row.status = 'paid' then
    update public.orders set status = 'refunded' where id = order_row.id;
    update public.ticket_holds set status = 'cancelled'
    where order_id = order_row.id and status = 'consumed';
  elsif order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.orders set status = 'expired' where id = order_row.id;
    update public.ticket_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.table_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
  end if;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    payment_row.organization_id, 'payment.' || target_status::text,
    'payment', payment_row.id, jsonb_build_object('provider_status', target_provider_status)
  );
  return target_status::text;
end;
$$;

create or replace function public.issue_tickets_for_paid_order(
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
  table_row public.event_tables;
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
          customer_row.first_name, customer_row.last_name, customer_row.document,
          coalesce(event_row.doors_open_at, event_row.starts_at),
          coalesce(event_row.ends_at, event_row.starts_at + interval '12 hours'),
          credential->>'short_code', credential->>'qr_token_hash', credential->>'qr_token_encrypted'
        );
        inserted_count := inserted_count + 1;
      end loop;
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
$$;

create function public.refund_table_fulfillment_after_order_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hold_row record;
  used_entry_count integer;
  release_table boolean;
begin
  if new.status = 'refunded' and old.status is distinct from new.status then
    for hold_row in
      select h.id, h.organization_id, h.event_table_id, e.starts_at
      from public.table_holds h
      join public.events e on e.id = h.event_id
      where h.order_id = new.id and h.status = 'consumed'
      order by h.event_table_id for update of h
    loop
      select coalesce(max(t.used_entries), 0) into used_entry_count
      from public.tickets t
      where t.order_id = new.id and t.event_table_id = hold_row.event_table_id;
      release_table := hold_row.starts_at > now() and used_entry_count = 0;
      update public.table_holds
      set status = case when release_table then 'cancelled'::public.table_hold_status else 'refund_review'::public.table_hold_status end
      where id = hold_row.id;
      insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
      values (
        hold_row.organization_id,
        case when release_table then 'table.refunded_released' else 'table.refunded_review' end,
        'event_table', hold_row.event_table_id,
        jsonb_build_object(
          'order_id', new.id, 'released', release_table, 'used_entries', used_entry_count
        )
      );
    end loop;
    update public.entitlements
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where order_id = new.id and status <> 'revoked';
  end if;
  return new;
end;
$$;

create trigger orders_refund_table_fulfillment
after update of status on public.orders
for each row execute function public.refund_table_fulfillment_after_order_refund();

create function public.get_event_table_metrics(target_event uuid)
returns table (
  sold_tables bigint,
  total_tables bigint,
  table_revenue bigint,
  held_tables bigint,
  currency char(3)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    (select count(distinct h.event_table_id) from public.table_holds h
      where h.event_id = target_event and h.status in ('consumed', 'refund_review')),
    (select count(*) from public.event_tables et
      where et.event_id = target_event and et.active),
    (select coalesce(sum(i.line_total_amount), 0)::bigint
      from public.order_items i join public.orders o on o.id = i.order_id
      where o.event_id = target_event and o.status = 'paid' and i.item_type = 'table'),
    (select count(distinct h.event_table_id) from public.table_holds h
      where h.event_id = target_event and h.status = 'active' and h.expires_at > now()),
    event_row.currency;
end;
$$;

create or replace function public.get_event_ticket_metrics(target_event uuid)
returns table (tickets_issued bigint, paid_orders bigint, delivery_failures bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_organization uuid;
begin
  select organization_id into target_organization from public.events where id = target_event;
  if target_organization is null or auth.uid() is null
    or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    (select count(*) from public.tickets t where t.event_id = target_event and t.ticket_type_id is not null),
    (select count(*) from public.orders o where o.event_id = target_event and o.status = 'paid'),
    (select count(*) from public.ticket_deliveries d where d.event_id = target_event and d.status = 'failed');
end;
$$;

create or replace function public.get_dashboard_sales_metrics(target_organization uuid)
returns table (confirmed_orders bigint, confirmed_tickets bigint, pending_reservations bigint)
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
    (select count(*) from public.tickets t join public.orders o on o.id = t.order_id
      where t.organization_id = target_organization and o.status = 'paid' and t.ticket_type_id is not null),
    (select coalesce(sum(h.quantity), 0) from public.ticket_holds h
      where h.organization_id = target_organization and h.status = 'active' and h.expires_at > now())
    + (select count(*) from public.table_holds h
      where h.organization_id = target_organization and h.status = 'active' and h.expires_at > now());
end;
$$;

revoke all on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.issue_tickets_for_paid_order(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_table_fulfillment_after_order_refund() from public, anon, authenticated;
revoke all on function public.get_event_table_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_ticket_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_dashboard_sales_metrics(uuid) from public, anon, authenticated;

grant execute on function public.process_payment_update(text, text, public.payment_status, text, text, bigint, char, bigint, bigint, timestamptz) to service_role;
grant execute on function public.issue_tickets_for_paid_order(uuid, jsonb) to service_role;
grant execute on function public.get_event_table_metrics(uuid) to authenticated;
grant execute on function public.get_event_ticket_metrics(uuid) to authenticated;
grant execute on function public.get_dashboard_sales_metrics(uuid) to authenticated;
