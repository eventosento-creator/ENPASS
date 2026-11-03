-- Ingreso del comprador con un código de 6 dígitos (además del link): la persona lo escribe en la misma pantalla y no tiene que salir de la página.
-- El código es de un solo uso, vence junto con el link (15 minutos), solo vale el último pedido de ese email y tiene tope de 5 intentos.
-- Se guarda hasheado (código + hash del email), como el resto de las credenciales del comprador.

alter table public.buyer_access_tokens
  add column if not exists code_hash text,
  add column if not exists code_attempts integer not null default 0;

create index if not exists buyer_access_tokens_code_idx on public.buyer_access_tokens (email_hash, created_at desc) where code_hash is not null;

-- Asocia un código a un pedido de acceso ya creado. Un pedido nuevo invalida los códigos anteriores de ese email.
create or replace function public.set_buyer_access_code(target_token_hash text, target_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_row public.buyer_access_tokens;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$' or target_code_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  select * into access_row from public.buyer_access_tokens where token_hash = target_token_hash for update;
  if not found or access_row.exchanged_at is not null or access_row.revoked_at is not null or access_row.expires_at <= now() then
    return false;
  end if;
  update public.buyer_access_tokens set code_hash = null
  where email_hash = access_row.email_hash and id <> access_row.id and code_hash is not null;
  update public.buyer_access_tokens set code_hash = target_code_hash, code_attempts = 0 where id = access_row.id;
  return true;
end;
$$;

-- Canjea el código por una sesión. Cuenta el intento aunque falle (por eso devuelve false en vez de lanzar un error).
create or replace function public.exchange_buyer_access_code(
  target_email_hash text,
  target_code_hash text,
  target_session_hash text,
  target_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_row public.buyer_access_tokens;
  exchanged boolean;
begin
  if target_email_hash !~ '^[0-9a-f]{64}$' or target_code_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select * into access_row
  from public.buyer_access_tokens
  where email_hash = target_email_hash
    and code_hash is not null
    and exchanged_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found or access_row.code_attempts >= 5 then
    return false;
  end if;

  update public.buyer_access_tokens set code_attempts = code_attempts + 1 where id = access_row.id;

  if access_row.code_hash <> target_code_hash then
    return false;
  end if;

  exchanged := public.exchange_buyer_access_token(access_row.token_hash, target_session_hash, target_session_expires_at);
  if exchanged then
    update public.buyer_access_tokens set code_hash = null where id = access_row.id;
  end if;
  return exchanged;
end;
$$;

revoke all on function public.set_buyer_access_code(text, text) from public, anon, authenticated;
revoke all on function public.exchange_buyer_access_code(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_buyer_access_code(text, text), public.exchange_buyer_access_code(text, text, text, timestamptz) to service_role;
