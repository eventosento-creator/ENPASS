alter table public.customers add column notes text not null default '';
alter table public.customers add column tags text[] not null default '{}';

create function public.update_customer_notes(
  target_customer uuid,
  target_notes text,
  target_tags text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id from public.customers where id = target_customer;
  if org_id is null or not public.can_manage_org(org_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.customers
  set notes = coalesce(target_notes, ''),
      tags = coalesce(target_tags, '{}')
  where id = target_customer;
end;
$$;

revoke all on function public.update_customer_notes(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.update_customer_notes(uuid, text, text[]) to authenticated;
