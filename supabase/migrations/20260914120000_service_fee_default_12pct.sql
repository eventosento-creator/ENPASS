-- Cargo de servicio ENPASS: fijo en 12%, pagado por el comprador (no configurable desde la app).
-- Ver memoria de proyecto "ENPASS pricing model" (2026-09-14): el fee se suma al precio base,
-- nunca se descuenta del productor.

alter table public.organizations
  alter column service_fee_bps set default 1200;

update public.organizations
  set service_fee_bps = 1200
  where service_fee_bps = 0;
