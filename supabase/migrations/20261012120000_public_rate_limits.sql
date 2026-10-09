-- Tope contra spam en los formularios públicos.
--  1) check_rate_limit: contador genérico (por IP, por email, por club...) que usa el servidor antes de procesar un pedido.
--  2) Las funciones de reserva de entradas y de solicitud de socio dejan de ser ejecutables desde afuera (anon/authenticated):
--     la app las llama solo desde el servidor, ya con cuenta verificada y con el tope aplicado. Así no se pueden invocar directo
--     contra la API de Supabase para saltear la cuenta obligatoria o inundar de reservas.

create table if not exists public.rate_limit_hits (
  scope text not null check (char_length(scope) between 1 and 60),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_lookup_idx on public.rate_limit_hits (scope, key_hash, created_at desc);
alter table public.rate_limit_hits enable row level security; -- sin policies: solo el servidor, vía función

-- true = el pedido puede seguir (y se anota); false = ya superó el tope en esa ventana.
create or replace function public.check_rate_limit(target_scope text, target_key text, max_hits integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare hashed text := encode(sha256(convert_to(coalesce(target_key, ''), 'utf8')), 'hex'); recent integer;
begin
  if max_hits < 1 or window_seconds < 1 then raise exception 'INVALID_RATE_LIMIT' using errcode = 'P0001'; end if;
  select count(*) into recent from public.rate_limit_hits
  where scope = target_scope and key_hash = hashed and created_at > now() - make_interval(secs => window_seconds);
  if recent >= max_hits then return false; end if;
  insert into public.rate_limit_hits (scope, key_hash) values (target_scope, hashed);
  -- Limpieza oportunista de registros viejos (no hace falta un cron).
  if random() < 0.02 then delete from public.rate_limit_hits where created_at < now() - interval '2 days'; end if;
  return true;
end;
$$;
revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;
grant select, insert, delete on public.rate_limit_hits to service_role;

-- Reservas: solo el servidor (service_role).
revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb, uuid, uuid) to service_role;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text, uuid, uuid) to service_role;

-- Solicitud de socio: solo el servidor.
revoke all on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
