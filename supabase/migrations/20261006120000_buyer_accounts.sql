-- Cuenta de comprador obligatoria para comprar.
-- Hasta ahora el "acceso" por link al mail solo se mandaba si el email ya tenía una compra paga.
-- Ahora cualquier email válido puede pedir su acceso (eso crea su cuenta: el email queda
-- verificado al entrar con el link). La sesión guarda el email para que el checkout use ESE email
-- (verificado) y no uno escrito a mano.

alter table public.buyer_access_tokens add column if not exists email text;
alter table public.buyer_sessions add column if not exists email text;

create or replace function public.create_buyer_access_token(
  target_email text,
  target_token_hash text,
  target_email_hash text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_id uuid;
  normalized_email text := lower(trim(target_email));
  calculated_email_hash text;
  organization_row record;
begin
  calculated_email_hash := encode(
    extensions.digest(convert_to(normalized_email, 'UTF8'), 'sha256'),
    'hex'
  );

  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_email_hash <> calculated_email_hash
    or target_expires_at <= now()
    or target_expires_at > now() + interval '4 days' then
    raise exception 'INVALID_BUYER_ACCESS_REQUEST' using errcode = 'P0001';
  end if;

  -- Freno anti-abuso: ya no exigimos una compra previa, así que limitamos los links por email.
  if (select count(*) from public.buyer_access_tokens
      where email_hash = target_email_hash and created_at > now() - interval '1 hour') >= 5 then
    return null;
  end if;

  insert into public.buyer_access_tokens (token_hash, email_hash, email, expires_at)
  values (target_token_hash, target_email_hash, normalized_email, target_expires_at)
  returning id into access_id;

  insert into public.buyer_access_token_customers (access_token_id, customer_id)
  select distinct access_id, c.id
  from public.customers c
  join public.tickets t on t.customer_id = c.id
  join public.orders o on o.id = t.order_id and o.status in ('paid', 'refunded')
  where lower(c.email) = normalized_email;

  for organization_row in
    select distinct c.organization_id
    from public.customers c
    join public.buyer_access_token_customers link on link.customer_id = c.id
    where link.access_token_id = access_id
  loop
    insert into public.audit_logs (organization_id, action, entity_type, entity_id)
    values (organization_row.organization_id, 'buyer.magic_link.requested', 'buyer_access_token', access_id);
  end loop;

  return access_id;
end;
$$;

create or replace function public.exchange_buyer_access_token(
  target_token_hash text,
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
  session_id uuid;
  organization_row record;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$'
    or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_session_expires_at <= now()
    or target_session_expires_at > now() + interval '31 days' then
    return false;
  end if;

  select * into access_row
  from public.buyer_access_tokens
  where token_hash = target_token_hash
  for update;

  if not found or access_row.expires_at <= now()
    or access_row.exchanged_at is not null or access_row.revoked_at is not null then
    return false;
  end if;

  insert into public.buyer_sessions (session_hash, email, expires_at)
  values (target_session_hash, access_row.email, target_session_expires_at)
  returning id into session_id;

  insert into public.buyer_session_customers (buyer_session_id, customer_id)
  select session_id, customer_id
  from public.buyer_access_token_customers
  where access_token_id = access_row.id;

  update public.buyer_access_tokens set exchanged_at = now() where id = access_row.id;

  for organization_row in
    select distinct c.organization_id
    from public.customers c
    join public.buyer_session_customers link on link.customer_id = c.id
    where link.buyer_session_id = session_id
  loop
    insert into public.audit_logs (organization_id, action, entity_type, entity_id)
    values (organization_row.organization_id, 'buyer.access.granted', 'buyer_session', session_id);
  end loop;

  return true;
end;
$$;

-- Las entradas de la cuenta = las de su email verificado (así lo comprado DESPUÉS de entrar
-- aparece sin tener que pedir otro link) + lo que ya estaba vinculado a la sesión.
create or replace function public.get_buyer_session_customers(target_session_hash text)
returns table (customer_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
  session_email text;
begin
  update public.buyer_sessions
  set last_used_at = now()
  where session_hash = target_session_hash
    and revoked_at is null
    and expires_at > now()
  returning id, email into session_id, session_email;

  if session_id is null then
    return;
  end if;

  return query
  select link.customer_id
  from public.buyer_session_customers link
  where link.buyer_session_id = session_id
  union
  select c.id
  from public.customers c
  where session_email is not null
    and lower(c.email) = session_email
    and exists (
      select 1 from public.tickets t
      join public.orders o on o.id = t.order_id and o.status in ('paid', 'refunded')
      where t.customer_id = c.id
    );
end;
$$;

-- Devuelve el email de la cuenta si la sesión es válida (null si no hay sesión o venció).
-- Sesiones viejas sin email: se deduce de un cliente vinculado.
create or replace function public.get_buyer_session_email(target_session_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
  session_email text;
begin
  update public.buyer_sessions
  set last_used_at = now()
  where session_hash = target_session_hash
    and revoked_at is null
    and expires_at > now()
  returning id, email into session_id, session_email;

  if session_id is null then
    return null;
  end if;

  if session_email is null then
    select lower(c.email) into session_email
    from public.buyer_session_customers link
    join public.customers c on c.id = link.customer_id
    where link.buyer_session_id = session_id
    limit 1;
  end if;

  return session_email;
end;
$$;

revoke all on function public.get_buyer_session_email(text) from public, anon, authenticated;
grant execute on function public.get_buyer_session_email(text) to service_role;
