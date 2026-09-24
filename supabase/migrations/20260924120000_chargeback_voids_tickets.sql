-- Chargebacks now void the order's tickets and block a second ledger reversal.
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
  required_seat_entries bigint := 0;
  event_used bigint := 0;
  inventory_conflict boolean := false;
  hold_group record;
  table_hold_group record;
  seat_hold_group record;
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
    update public.seat_holds h set status = 'expired'
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
    perform 1 from public.event_seats es
    where es.id in (
      select h.event_seat_id from public.seat_holds h where h.order_id = order_row.id
    ) order by es.id for update;

    select coalesce(sum(h.quantity), 0) into required_ticket_entries
    from public.ticket_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    select coalesce(sum(et.capacity), 0) into required_table_entries
    from public.table_holds h
    join public.event_tables et on et.id = h.event_table_id
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    select count(*) into required_seat_entries
    from public.seat_holds h
    where h.order_id = order_row.id and h.status in ('active', 'expired');
    if required_ticket_entries + required_table_entries + required_seat_entries = 0
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
      + coalesce((
        select count(*)
        from public.seat_holds h
        where h.event_id = order_row.event_id and h.order_id <> order_row.id
          and (h.status in ('consumed', 'refund_review') or (h.status = 'active' and h.expires_at > now()))
      ), 0)
    into event_used;
    if event_used + required_ticket_entries + required_table_entries + required_seat_entries > event_row.capacity then
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

    for seat_hold_group in
      select h.event_seat_id
      from public.seat_holds h
      where h.order_id = order_row.id and h.status in ('active', 'expired')
      order by h.event_seat_id
    loop
      if exists (
        select 1 from public.seat_holds other_holds
        where other_holds.event_seat_id = seat_hold_group.event_seat_id
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
      update public.seat_holds set status = 'expired'
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
    update public.seat_holds set status = 'consumed'
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
    if order_row.subtotal_amount > 0 then
      insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description)
      values (payment_row.organization_id, 'ticket_sale', order_row.subtotal_amount, order_row.currency, order_row.id, payment_row.id, order_row.event_id, 'Venta confirmada');
    end if;
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
    if order_row.subtotal_amount > 0 then
      insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description)
      values (payment_row.organization_id, 'refund', -order_row.subtotal_amount, order_row.currency, order_row.id, payment_row.id, order_row.event_id, 'Reembolso de venta');
    end if;
  elsif target_status = 'charged_back' and order_row.status = 'paid' and payment_row.status <> 'charged_back' then
    -- Flipping the order to 'refunded' fires the existing trigger that voids its tickets (so a
    -- charged-back buyer can no longer check in) and, because the order is no longer 'paid',
    -- a later 'refunded' update cannot reverse the ledger a second time.
    update public.orders set status = 'refunded' where id = order_row.id;
    update public.ticket_holds set status = 'cancelled'
    where order_id = order_row.id and status = 'consumed';
    if order_row.subtotal_amount > 0 then
      insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description)
      values (payment_row.organization_id, 'chargeback', -order_row.subtotal_amount, order_row.currency, order_row.id, payment_row.id, order_row.event_id, 'Contracargo');
    end if;
  elsif order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.orders set status = 'expired' where id = order_row.id;
    update public.ticket_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.table_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.seat_holds set status = 'expired'
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

