revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_org(uuid) from public, anon, authenticated;
revoke all on function public.create_organization(text, text) from public, anon, authenticated;
revoke all on function public.publish_event(uuid) from public, anon, authenticated;
revoke all on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_public_order(text) from public, anon, authenticated;
revoke all on function public.get_public_ticket_types(uuid) from public, anon, authenticated;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
grant execute on function public.create_guest_checkout(uuid, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_public_order(text) to anon, authenticated;
grant execute on function public.get_public_ticket_types(uuid) to anon, authenticated;
