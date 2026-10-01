-- Mostrar en Ajustes qué cuenta de Mercado Pago está conectada (hoy solo se mostraba
-- "Conectado", sin decir cuál). Guardamos el email que devuelve MP en GET /users/me al
-- conectar (no en cada refresh de token, no hace falta y evita una llamada extra en caliente).
alter table public.payment_accounts add column provider_account_email text;

drop function if exists public.get_payment_account_status(uuid);
create function public.get_payment_account_status(target_organization uuid)
returns table (
  provider text,
  status public.payment_account_status,
  connected_at timestamptz,
  disconnected_at timestamptz,
  expires_at timestamptz,
  live_mode boolean,
  provider_account_email text
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
  select a.provider, a.status, a.connected_at, a.disconnected_at, a.expires_at, a.live_mode, a.provider_account_email
  from public.payment_accounts a
  where a.organization_id = target_organization
  order by a.created_at desc
  limit 1;
end;
$$;
revoke all on function public.get_payment_account_status(uuid) from public, anon, authenticated;
grant execute on function public.get_payment_account_status(uuid) to authenticated;
