-- Run this alone, before the box-office migration: Postgres cannot use a new enum value
-- in the same transaction that adds it.
alter type public.order_channel add value if not exists 'box_office';
alter type public.pos_payment_method add value if not exists 'qr';
alter type public.pos_payment_method add value if not exists 'debit_card';
alter type public.pos_payment_method add value if not exists 'credit_card';
alter type public.pos_payment_method add value if not exists 'other';
