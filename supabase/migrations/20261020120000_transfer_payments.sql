-- Pago de entradas por transferencia bancaria a ENPASS ("ENPASS Recaudación").
-- El comprador transfiere al alias de ENPASS, sube el comprobante y alguien de ENPASS lo aprueba o lo rechaza.
-- Al aprobar se usa el mismo process_payment_update que Mercado Pago y la caja: la orden pasa a pagada, se
-- registra la venta en el ledger del productor y se emiten las entradas. La plata queda en ENPASS hasta liquidarla.
--
-- Reserva: 30 minutos para subir el comprobante; ya subido, las entradas quedan reservadas hasta 24 hs para que ENPASS lo revise.
-- Si se aprueba después de que la reserva venció, process_payment_update ya recupera el cupo si sigue libre
-- o deja la orden como conflicto de inventario (devolución manual).

-- 1) Interruptor por productor (lo maneja solo ENPASS). Apagado por defecto.
alter table public.organizations
  add column if not exists ticket_transfer_enabled boolean not null default false;

-- 2) Datos bancarios de ENPASS (una sola fila). Sin policies: solo se leen/escriben por las funciones de abajo.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  transfer_alias text check (transfer_alias is null or transfer_alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  transfer_cbu text check (transfer_cbu is null or transfer_cbu ~ '^[0-9]{22}$'),
  transfer_holder text check (transfer_holder is null or char_length(transfer_holder) <= 120),
  transfer_cuit text check (transfer_cuit is null or transfer_cuit ~ '^[0-9]{11}$'),
  transfer_bank text check (transfer_bank is null or char_length(transfer_bank) <= 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- 3) Datos del comprobante en el pago.
alter table public.payments
  add column if not exists transfer_proof_path text check (transfer_proof_path is null or char_length(transfer_proof_path) <= 300),
  add column if not exists transfer_proof_uploaded_at timestamptz,
  add column if not exists transfer_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists transfer_reviewed_at timestamptz,
  add column if not exists transfer_rejection_reason text check (transfer_rejection_reason is null or char_length(transfer_rejection_reason) <= 300);

-- 4) Bucket privado para los comprobantes (se leen con URLs firmadas desde el panel de ENPASS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transfer-proofs', 'transfer-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- 5) Panel ENPASS: datos bancarios y habilitación por productor.
create or replace function public.set_platform_transfer_details(target_alias text, target_cbu text, target_holder text, target_cuit text, target_bank text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  update public.platform_settings set
    transfer_alias = nullif(trim(coalesce(target_alias, '')), ''),
    transfer_cbu = nullif(regexp_replace(coalesce(target_cbu, ''), '[^0-9]', '', 'g'), ''),
    transfer_holder = nullif(trim(coalesce(target_holder, '')), ''),
    transfer_cuit = nullif(regexp_replace(coalesce(target_cuit, ''), '[^0-9]', '', 'g'), ''),
    transfer_bank = nullif(trim(coalesce(target_bank, '')), ''),
    updated_at = now(), updated_by = auth.uid()
  where id;
end;
$$;

create or replace function public.get_platform_transfer_details()
returns table (transfer_alias text, transfer_cbu text, transfer_holder text, transfer_cuit text, transfer_bank text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query select s.transfer_alias, s.transfer_cbu, s.transfer_holder, s.transfer_cuit, s.transfer_bank from public.platform_settings s where s.id;
end;
$$;

create or replace function public.set_ticket_transfer_enabled(target_org uuid, target_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  update public.organizations set ticket_transfer_enabled = target_enabled where id = target_org;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'org.ticket_transfer.set', 'organization', target_org, jsonb_build_object('enabled', target_enabled));
end;
$$;

-- 6) Extiende la reserva de una orden (entradas, mesas y butacas).
create or replace function public.extend_order_hold(target_order uuid, new_expiry timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ticket_holds set expires_at = new_expiry where order_id = target_order and status = 'active' and expires_at < new_expiry;
  update public.table_holds set expires_at = new_expiry where order_id = target_order and status = 'active' and expires_at < new_expiry;
  update public.seat_holds set expires_at = new_expiry where order_id = target_order and status = 'active' and expires_at < new_expiry;
  update public.orders set expires_at = new_expiry where id = target_order and status = 'pending' and expires_at < new_expiry;
end;
$$;
revoke all on function public.extend_order_hold(uuid, timestamptz) from public, anon, authenticated;

-- 7) El comprador elige "Transferencia": crea (o reutiliza) el intento de pago y estira la reserva a 30 minutos.
create or replace function public.start_transfer_payment(target_order_public_id text)
returns table (payment_public_id text, payment_status public.payment_status, total_amount bigint, currency char(3), expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  org_enabled boolean;
  details public.platform_settings;
  payment_row public.payments;
  next_attempt integer;
begin
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'pending' or order_row.expires_at <= now() then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;
  if order_row.total_amount <= 0 or order_row.channel = 'box_office' then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;
  select o.ticket_transfer_enabled into org_enabled from public.organizations o where o.id = order_row.organization_id;
  select * into details from public.platform_settings where id;
  if not coalesce(org_enabled, false) or details.transfer_alias is null or details.transfer_cbu is null then
    raise exception 'TRANSFER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  -- Un pago de Mercado Pago ya en proceso o aprobado bloquea cambiar de medio.
  if exists (select 1 from public.payments p where p.order_id = order_row.id and p.provider = 'mercado_pago' and p.status in ('processing', 'approved')) then
    raise exception 'PAYMENT_IN_PROGRESS' using errcode = 'P0001';
  end if;

  -- Solo puede haber un pago abierto por orden: un intento de Mercado Pago que todavía no se pagó se cancela al elegir transferencia.
  update public.payments set status = 'cancelled'
  where order_id = order_row.id and provider = 'mercado_pago' and status = 'pending';
  select * into payment_row from public.payments p
  where p.order_id = order_row.id and p.provider = 'manual' and p.method = 'bank_transfer' and p.status in ('pending', 'processing')
  order by p.created_at desc limit 1 for update;
  if not found then
    select coalesce(max(p.attempt_number), 0) + 1 into next_attempt from public.payments p where p.order_id = order_row.id;
    insert into public.payments (organization_id, order_id, payment_account_id, provider, attempt_number, status, currency, gross_amount, service_fee_amount, platform_fee_amount, method)
    values (order_row.organization_id, order_row.id, null, 'manual', next_attempt, 'pending', order_row.currency, order_row.total_amount, order_row.service_fee_amount, 0, 'bank_transfer')
    returning * into payment_row;
    insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
    values (order_row.organization_id, 'payment.transfer.started', 'payment', payment_row.id, jsonb_build_object('order_id', order_row.id, 'total', order_row.total_amount));
  end if;
  if payment_row.status = 'pending' then
    perform public.extend_order_hold(order_row.id, now() + interval '30 minutes');
  end if;
  select o.expires_at into expires_at from public.orders o where o.id = order_row.id;
  return query select payment_row.public_id, payment_row.status, order_row.total_amount, order_row.currency, expires_at;
end;
$$;

-- 8) Datos para mostrar al comprador: alias/CBU de ENPASS y el estado de su transferencia.
create or replace function public.get_transfer_instructions(target_order_public_id text)
returns table (
  available boolean, payment_public_id text, payment_status public.payment_status, proof_uploaded boolean, rejection_reason text,
  transfer_alias text, transfer_cbu text, transfer_holder text, transfer_cuit text, transfer_bank text
) language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  org_enabled boolean;
  details public.platform_settings;
  payment_row public.payments;
begin
  select * into order_row from public.orders where public_id = target_order_public_id;
  if not found then return; end if;
  select o.ticket_transfer_enabled into org_enabled from public.organizations o where o.id = order_row.organization_id;
  select * into details from public.platform_settings where id;
  select * into payment_row from public.payments p
  where p.order_id = order_row.id and p.provider = 'manual' and p.method = 'bank_transfer'
  order by p.created_at desc limit 1;
  return query select
    (coalesce(org_enabled, false) and details.transfer_alias is not null and details.transfer_cbu is not null and order_row.total_amount > 0 and order_row.channel <> 'box_office'),
    payment_row.public_id, payment_row.status, (payment_row.transfer_proof_path is not null), payment_row.transfer_rejection_reason,
    details.transfer_alias, details.transfer_cbu, details.transfer_holder, details.transfer_cuit, details.transfer_bank;
end;
$$;

-- 9) El comprador subió el comprobante: pasa a revisión y la reserva se mantiene hasta 24 hs.
create or replace function public.submit_transfer_proof(target_order_public_id text, target_proof_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  payment_row public.payments;
begin
  if target_proof_path is null or char_length(target_proof_path) not between 5 and 300 then raise exception 'INVALID_PROOF' using errcode = 'P0001'; end if;
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'pending' then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments p
  where p.order_id = order_row.id and p.provider = 'manual' and p.method = 'bank_transfer' and p.status = 'pending'
  order by p.created_at desc limit 1 for update;
  if not found then raise exception 'TRANSFER_NOT_STARTED' using errcode = 'P0001'; end if;
  if order_row.expires_at <= now() then raise exception 'HOLD_EXPIRED' using errcode = 'P0001'; end if;
  update public.payments set status = 'processing', transfer_proof_path = target_proof_path, transfer_proof_uploaded_at = now(),
    transfer_rejection_reason = null where id = payment_row.id;
  perform public.extend_order_hold(order_row.id, now() + interval '24 hours');
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, 'payment.transfer.proof_submitted', 'payment', payment_row.id, jsonb_build_object('order_id', order_row.id));
end;
$$;

-- 10) ENPASS aprueba o rechaza. Aprobar usa el mismo camino que cualquier pago confirmado.
create or replace function public.review_transfer_payment(target_payment_public_id text, target_approve boolean, target_reason text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  payment_row public.payments;
  order_row public.orders;
  result text;
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments where public_id = target_payment_public_id and provider = 'manual' and method = 'bank_transfer' for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if payment_row.status <> 'processing' then raise exception 'PAYMENT_NOT_IN_REVIEW' using errcode = 'P0001'; end if;
  select * into order_row from public.orders where id = payment_row.order_id for update;

  if target_approve then
    result := public.process_payment_update(
      payment_row.public_id, 'transfer-' || payment_row.id::text, 'approved', 'approved', '',
      payment_row.gross_amount, payment_row.currency, 0, null, now(), 0
    );
    update public.payments set transfer_reviewed_by = auth.uid(), transfer_reviewed_at = now() where id = payment_row.id;
    if result = 'approved' then
      -- ENPASS recibió la plata: queda registrada (el saldo del productor sigue saliendo solo de ticket_sale/refund).
      insert into public.ledger_movements (organization_id, movement_type, amount, currency, order_id, payment_id, event_id, description, metadata)
      values (payment_row.organization_id, 'payment_received', payment_row.gross_amount, payment_row.currency, payment_row.order_id, payment_row.id,
        order_row.event_id, 'Transferencia recibida por ENPASS', jsonb_build_object('collected_by', 'enpass', 'method', 'bank_transfer'));
    end if;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (payment_row.organization_id, auth.uid(), 'payment.transfer.approved', 'payment', payment_row.id, jsonb_build_object('result', result, 'order_id', order_row.id));
    return result;
  end if;

  update public.payments set status = 'rejected', transfer_reviewed_by = auth.uid(), transfer_reviewed_at = now(),
    transfer_rejection_reason = nullif(trim(coalesce(target_reason, '')), '') where id = payment_row.id;
  -- El comprador puede volver a intentarlo: la reserva queda 30 minutos más (si todavía está pendiente).
  if order_row.status = 'pending' then
    perform public.extend_order_hold(order_row.id, now() + interval '30 minutes');
    update public.ticket_holds set expires_at = least(expires_at, now() + interval '30 minutes') where order_id = order_row.id and status = 'active';
    update public.table_holds set expires_at = least(expires_at, now() + interval '30 minutes') where order_id = order_row.id and status = 'active';
    update public.seat_holds set expires_at = least(expires_at, now() + interval '30 minutes') where order_id = order_row.id and status = 'active';
    update public.orders set expires_at = least(expires_at, now() + interval '30 minutes') where id = order_row.id;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (payment_row.organization_id, auth.uid(), 'payment.transfer.rejected', 'payment', payment_row.id,
    jsonb_build_object('order_id', order_row.id, 'reason', nullif(trim(coalesce(target_reason, '')), '')));
  return 'rejected';
end;
$$;

-- 11) Bandeja de transferencias para ENPASS.
create or replace function public.list_transfer_payments(target_status text default 'processing', target_limit integer default 100)
returns table (
  payment_public_id text, order_public_id text, status public.payment_status, event_name text, organization_name text,
  buyer_name text, buyer_email text, buyer_document text, total_amount bigint, service_fee_amount bigint, currency char(3),
  proof_path text, proof_uploaded_at timestamptz, created_at timestamptz, reviewed_at timestamptz, rejection_reason text, order_status public.order_status
) language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select p.public_id, o.public_id, p.status, e.name, org.name, trim(c.first_name || ' ' || c.last_name), c.email, c.document,
    p.gross_amount, p.service_fee_amount, p.currency, p.transfer_proof_path, p.transfer_proof_uploaded_at, p.created_at,
    p.transfer_reviewed_at, p.transfer_rejection_reason, o.status
  from public.payments p
  join public.orders o on o.id = p.order_id
  join public.events e on e.id = o.event_id
  join public.organizations org on org.id = p.organization_id
  left join public.customers c on c.id = o.customer_id
  where p.provider = 'manual' and p.method = 'bank_transfer'
    and (target_status = 'all' or p.status::text = target_status)
    and (target_status <> 'processing' or p.transfer_proof_path is not null)
  order by coalesce(p.transfer_proof_uploaded_at, p.created_at) desc
  limit least(greatest(coalesce(target_limit, 100), 1), 300);
end;
$$;

-- 12) prepare_payment_attempt (Mercado Pago): ya no reutiliza intentos manuales; un intento de transferencia sin comprobante se cancela
--     (el comprador cambió de medio) y uno en revisión bloquea pagar con otro medio.
create or replace function public.prepare_payment_attempt(target_order_public_id text)
returns table (payment_id uuid, payment_public_id text, payment_account_id uuid, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  account_row public.payment_accounts;
  payment_row public.payments;
  next_attempt integer;
begin
  select * into order_row from public.orders where public_id = target_order_public_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status = 'pending' and order_row.expires_at <= now() then
    update public.ticket_holds set status = 'expired' where order_id = order_row.id and status = 'active';
    update public.table_holds set status = 'expired' where order_id = order_row.id and status = 'active';
    update public.orders set status = 'expired' where id = order_row.id;
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if order_row.status <> 'pending' then raise exception 'ORDER_NOT_PAYABLE' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ticket_holds where order_id = order_row.id and status = 'active' and expires_at > now())
    and not exists (select 1 from public.table_holds where order_id = order_row.id and status = 'active' and expires_at > now()) then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments p where p.order_id = order_row.id and p.provider = 'manual' and p.method = 'bank_transfer' and p.status = 'processing') then
    raise exception 'TRANSFER_IN_REVIEW' using errcode = 'P0001';
  end if;
  update public.payments set status = 'cancelled'
  where order_id = order_row.id and provider = 'manual' and method = 'bank_transfer' and status = 'pending';
  select * into account_row from public.payment_accounts
  where organization_id = order_row.organization_id and provider = 'mercado_pago' and status = 'connected' and access_token_encrypted is not null for update;
  if not found then raise exception 'PAYMENT_ACCOUNT_REQUIRED' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments
  where order_id = order_row.id and provider = 'mercado_pago' and status in ('pending', 'processing')
  order by created_at desc limit 1 for update;
  if found then
    return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, true;
    return;
  end if;
  select coalesce(max(p.attempt_number), 0) + 1 into next_attempt from public.payments p where p.order_id = order_row.id;
  insert into public.payments (organization_id, order_id, payment_account_id, provider, attempt_number, currency, gross_amount, service_fee_amount, platform_fee_amount, method)
  values (order_row.organization_id, order_row.id, account_row.id, 'mercado_pago', next_attempt, order_row.currency, order_row.total_amount,
    order_row.service_fee_amount, order_row.service_fee_amount,
    case when order_row.channel = 'box_office' then 'mercado_pago'::public.pos_payment_method else null end)
  returning * into payment_row;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (order_row.organization_id, 'payment.created', 'payment', payment_row.id, jsonb_build_object('attempt', payment_row.attempt_number, 'status', payment_row.status));
  return query select payment_row.id, payment_row.public_id, payment_row.payment_account_id, false;
end;
$$;

-- 13) Permisos.
revoke all on function public.set_platform_transfer_details(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_platform_transfer_details() from public, anon, authenticated;
revoke all on function public.set_ticket_transfer_enabled(uuid, boolean) from public, anon, authenticated;
revoke all on function public.start_transfer_payment(text) from public, anon, authenticated;
revoke all on function public.get_transfer_instructions(text) from public, anon, authenticated;
revoke all on function public.submit_transfer_proof(text, text) from public, anon, authenticated;
revoke all on function public.review_transfer_payment(text, boolean, text) from public, anon, authenticated;
revoke all on function public.list_transfer_payments(text, integer) from public, anon, authenticated;
grant execute on function public.set_platform_transfer_details(text, text, text, text, text) to authenticated;
grant execute on function public.get_platform_transfer_details() to authenticated;
grant execute on function public.set_ticket_transfer_enabled(uuid, boolean) to authenticated;
grant execute on function public.review_transfer_payment(text, boolean, text) to authenticated;
grant execute on function public.list_transfer_payments(text, integer) to authenticated;
grant execute on function public.start_transfer_payment(text) to service_role;
grant execute on function public.get_transfer_instructions(text) to service_role;
grant execute on function public.submit_transfer_proof(text, text) to service_role;

notify pgrst, 'reload schema';
