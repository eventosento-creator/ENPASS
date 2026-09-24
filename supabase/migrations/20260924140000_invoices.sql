-- ENPASS invoices for the buyer-paid service fee (Factura C / Nota de Crédito C).
-- Not visible to producers: this is ENPASS's own fiscal document. Only service_role touches it.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null check (kind in ('invoice', 'credit_note')),
  reason_key text not null,
  related_invoice_id uuid references public.invoices(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'issued', 'error', 'cancelled')),
  amount bigint not null check (amount > 0),
  currency char(3) not null,
  description text not null,
  customer_name text not null,
  customer_document text,
  customer_email text not null,
  issuer_cuit text,
  point_of_sale integer,
  cbte_type integer,
  invoice_number bigint,
  cae text,
  cae_expires_at date,
  issued_at timestamptz,
  pdf_url text,
  provider text,
  provider_reference text,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind, reason_key),
  check (kind = 'invoice' or related_invoice_id is not null)
);

create index invoices_work_queue_idx on public.invoices (next_attempt_at) where status in ('pending', 'processing');
create index invoices_order_idx on public.invoices (order_id);

alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select, update on public.invoices to service_role;

create or replace function public.invoices_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger invoices_touch_updated_at before update on public.invoices
for each row execute function public.invoices_touch_updated_at();

-- 1) A paid order with a buyer service fee gets a pending invoice, atomically with the status change.
create or replace function public.invoice_on_order_paid()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  customer_row public.customers;
  event_name text;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and new.service_fee_amount > 0 then
    select * into customer_row from public.customers where id = new.customer_id;
    select name into event_name from public.events where id = new.event_id;
    insert into public.invoices (order_id, kind, reason_key, amount, currency, description, customer_name, customer_document, customer_email)
    values (
      new.id, 'invoice', 'sale', new.service_fee_amount, new.currency,
      'Cargo por servicio de venta - ' || coalesce(event_name, 'Evento'),
      coalesce(nullif(trim(coalesce(customer_row.first_name, '') || ' ' || coalesce(customer_row.last_name, '')), ''), 'Consumidor Final'),
      customer_row.document, coalesce(customer_row.email, '')
    ) on conflict (order_id, kind, reason_key) do nothing;
  end if;
  return new;
end;
$$;
create trigger invoice_on_order_paid after insert or update of status on public.orders
for each row execute function public.invoice_on_order_paid();

-- 2) A fully refunded order (a chargeback also lands here) cancels an unissued invoice, or
--    queues a credit note for whatever part of an issued invoice is not yet credited.
create or replace function public.invoice_on_order_refunded()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invoice_row public.invoices;
  remaining bigint;
begin
  if new.status = 'refunded' and old.status is distinct from 'refunded' then
    select * into invoice_row from public.invoices
    where order_id = new.id and kind = 'invoice' and status <> 'cancelled';
    if not found then return new; end if;
    if invoice_row.status in ('pending', 'error') then
      update public.invoices set status = 'cancelled' where id = invoice_row.id;
    else
      select invoice_row.amount - coalesce(sum(amount), 0) into remaining
      from public.invoices where related_invoice_id = invoice_row.id and kind = 'credit_note' and status <> 'cancelled';
      if remaining > 0 then
        insert into public.invoices (order_id, kind, reason_key, related_invoice_id, amount, currency, description, customer_name, customer_document, customer_email)
        values (new.id, 'credit_note', 'full-refund', invoice_row.id, remaining, invoice_row.currency,
          'Anulación: ' || invoice_row.description, invoice_row.customer_name, invoice_row.customer_document, invoice_row.customer_email)
        on conflict (order_id, kind, reason_key) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger invoice_on_order_refunded after update of status on public.orders
for each row execute function public.invoice_on_order_refunded();

-- 3) A partial refund credits the proportional part of the service fee.
create or replace function public.invoice_on_partial_refund()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  order_row public.orders;
  invoice_row public.invoices;
  fee_delta bigint;
  remaining bigint;
begin
  if new.status = 'partially_refunded' and new.refunded_amount > old.refunded_amount and new.gross_amount > 0 then
    select * into order_row from public.orders where id = new.order_id;
    select * into invoice_row from public.invoices
    where order_id = new.order_id and kind = 'invoice' and status <> 'cancelled';
    if not found or order_row.service_fee_amount <= 0 then return new; end if;
    fee_delta := round((new.refunded_amount - old.refunded_amount)::numeric * order_row.service_fee_amount / new.gross_amount)::bigint;
    if fee_delta <= 0 then return new; end if;
    if invoice_row.status in ('pending', 'error') then
      if invoice_row.amount - fee_delta <= 0 then
        update public.invoices set status = 'cancelled' where id = invoice_row.id;
      else
        update public.invoices set amount = amount - fee_delta where id = invoice_row.id;
      end if;
    else
      select invoice_row.amount - coalesce(sum(amount), 0) into remaining
      from public.invoices where related_invoice_id = invoice_row.id and kind = 'credit_note' and status <> 'cancelled';
      fee_delta := least(fee_delta, remaining);
      if fee_delta > 0 then
        insert into public.invoices (order_id, kind, reason_key, related_invoice_id, amount, currency, description, customer_name, customer_document, customer_email)
        values (new.order_id, 'credit_note', 'partial-' || new.refunded_amount::text, invoice_row.id, fee_delta, invoice_row.currency,
          'Reembolso parcial: ' || invoice_row.description, invoice_row.customer_name, invoice_row.customer_document, invoice_row.customer_email)
        on conflict (order_id, kind, reason_key) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger invoice_on_partial_refund after update of refunded_amount on public.payments
for each row execute function public.invoice_on_partial_refund();
