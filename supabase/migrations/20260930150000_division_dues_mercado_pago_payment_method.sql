-- El check constraint de division_dues.payment_method se olvidó de 'mercado_pago'
-- (a diferencia de membership_dues, que sí lo tiene). Sin este fix, el webhook de
-- cobro online de cuotas de división fallaría al intentar marcar la cuota como pagada.
alter table public.division_dues
  drop constraint if exists division_dues_payment_method_check;

alter table public.division_dues
  add constraint division_dues_payment_method_check
  check (payment_method in ('cash', 'transfer', 'other', 'mercado_pago'));
