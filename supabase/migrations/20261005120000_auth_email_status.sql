-- Para que el login pueda decir "no tenés cuenta, creala" en vez de un error genérico.
-- Devuelve 'none' (no existe), 'password' (tiene cuenta con contraseña) o el nombre del proveedor
-- (ej. 'google') si solo entra con ese método. Solo service_role: se llama desde el servidor.
create function public.auth_email_status(target_email text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when bool_or(i.provider = 'email') then 'password' else min(i.provider) end
     from auth.users u join auth.identities i on i.user_id = u.id
     where lower(u.email) = lower(trim(target_email))),
    case when exists (select 1 from auth.users u where lower(u.email) = lower(trim(target_email))) then 'password' else 'none' end
  );
$$;
revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;
