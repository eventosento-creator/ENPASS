-- La migración de planes de cobro recreó create_membership (drop + create) y la nueva versión quedó ejecutable por
-- cualquiera (anon/public). La función ya rechaza a quien no sea del club, pero no debe ser invocable sin sesión.
-- Se restablecen los permisos como los tenía originalmente: solo usuarios con sesión.
revoke all on function public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.create_membership(uuid, uuid, text, text, text, text, text, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
