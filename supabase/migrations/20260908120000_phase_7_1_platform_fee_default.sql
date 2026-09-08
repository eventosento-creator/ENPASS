alter table public.organizations
  alter column platform_fee_bps set default 300;

update public.organizations
  set platform_fee_bps = 300
  where platform_fee_bps = 0;
