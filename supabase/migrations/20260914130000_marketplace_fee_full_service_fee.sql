-- El marketplace_fee que retiene la cuenta de ENPASS en Mercado Pago pasa a ser el
-- cargo de servicio completo (service_fee_amount, 12% pagado por el comprador), no
-- platform_fee_bps (3%, quedaba en el payout del productor). Ver memoria de proyecto
-- "ENPASS pricing model" (2026-09-14): "ENPASS recibe: cargo de servicio cobrado al
-- comprador."

create or replace function public.prepare_payment_attempt(target_order_public_id text)
returns table (
  payment_id uuid,
  payment_public_id text,
  payment_account_id uuid,
  reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  account_row public.payment_accounts;
  payment_row public.payments;
  next_attempt integer;
begin
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.ticket_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.table_holds set status = 'expired'
    where order_id = order_row.id and status = 'active';
    update public.orders set status = 'expired' where id = order_row.id;
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if order_row.status <> 'pending' then
    raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.ticket_holds
    where order_id = order_row.id and status = 'active' and expires_at > now()
  ) and not exists (
    select 1 from public.table_holds
    where order_id = order_row.id and status = 'active' and expires_at > now()
  ) then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  select * into account_row
  from public.payment_accounts
  where organization_id = order_row.organization_id
    and provider = 'mercado_pago' and status = 'connected'
    and access_token_encrypted is not null
  for update;
  if not found then raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;
  select * into payment_row
  from public.payments
  where order_id = order_row.id and status in ('pending', 'processing')
  order by created_at desc limit 1 for update;
  if found then
    return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, true;
    return;
  end if;
  select coalesce(max(p.attempt_number), 0) + 1 into next_attempt
  from public.payments p where p.order_id = order_row.id;
  insert into public.payments (
    organization_id, order_id, payment_account_id, provider, attempt_number,
    currency, gross_amount, service_fee_amount, platform_fee_amount
  ) values (
    order_row.organization_id, order_row.id, account_row.id, 'mercado_pago', next_attempt,
    order_row.currency, order_row.total_amount, order_row.service_fee_amount, order_row.service_fee_amount
  ) returning * into payment_row;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    order_row.organization_id, 'payment.created', 'payment', payment_row.id,
    jsonb_build_object('attempt', payment_row.attempt_number, 'status', payment_row.status)
  );
  return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, false;
end;
$$;

alter table public.organizations
  alter column platform_fee_bps set default 0;

update public.organizations set platform_fee_bps = 0;
