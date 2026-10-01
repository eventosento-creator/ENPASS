-- Bug real en producción: el mail "tu evento es hoy" manda un magic-link para ver las
-- entradas (createBuyerMagicLink) usando el mismo vencimiento de 15 minutos pensado para el
-- flujo de "mandame un acceso ahora" (donde el usuario lo clickea al toque). El cron de
-- recordatorios corre una vez por día y manda el mail entre 12 y 36hs antes del evento, así
-- que para cuando la persona lo abre en la puerta del evento, el link ya venció hace horas —
-- y encima create_buyer_access_token tiene un tope duro de 30 minutos acá en la base, así que
-- ni pidiendo un vencimiento más largo desde la app alcanzaba. Subimos el tope a 4 días (cubre
-- holgado la ventana de 36hs del cron + el evento en sí); el flujo interactivo de "mandame un
-- acceso" sigue pidiendo 15 minutos desde la app, esto no lo cambia.
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

  if not exists (
    select 1
    from public.customers c
    join public.tickets t on t.customer_id = c.id
    join public.orders o on o.id = t.order_id and o.status in ('paid', 'refunded')
    where lower(c.email) = normalized_email
  ) then
    return null;
  end if;

  insert into public.buyer_access_tokens (token_hash, email_hash, expires_at)
  values (target_token_hash, target_email_hash, target_expires_at)
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
