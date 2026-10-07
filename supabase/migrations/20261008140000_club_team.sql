-- Equipo del club: el dueño/admin invita colaboradores por email. Los colaboradores (club_staff) pueden
-- gestionar socios, categorías, divisiones y cuotas, pero NO la identidad, el equipo, los pagos ni los eventos.

create table if not exists public.club_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) between 5 and 320),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists club_staff_invitations_org_idx on public.club_staff_invitations(organization_id);
alter table public.club_staff_invitations enable row level security; -- sin policies: solo por RPC

create or replace function public.create_club_staff_invitation(target_org uuid, target_email text, target_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid; normalized text := lower(trim(target_email));
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  -- Una invitación vigente por email: la nueva reemplaza a la anterior.
  delete from public.club_staff_invitations where organization_id = target_org and lower(email) = normalized and accepted_at is null;
  insert into public.club_staff_invitations (organization_id, email, token_hash, invited_by)
  values (target_org, normalized, target_token_hash, auth.uid()) returning id into invitation_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club_staff.invited', 'club_staff_invitation', invitation_id);
  return invitation_id;
end;
$$;
revoke all on function public.create_club_staff_invitation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_club_staff_invitation(uuid, text, text) to authenticated;

-- Acepta la invitación: solo si el email de la cuenta coincide con el invitado. Devuelve la organización.
create or replace function public.accept_club_staff_invitation(raw_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.club_staff_invitations; account_email text;
begin
  if auth.uid() is null then return null; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  select * into invitation from public.club_staff_invitations
  where token_hash = raw_token_hash and accepted_at is null and expires_at > now() for update;
  if not found or account_email is distinct from lower(invitation.email) then return null; end if;
  insert into public.club_staff (organization_id, user_id, created_by)
  values (invitation.organization_id, auth.uid(), invitation.invited_by) on conflict (organization_id, user_id) do nothing;
  update public.club_staff_invitations set accepted_at = now() where id = invitation.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (invitation.organization_id, auth.uid(), 'club_staff.accepted', 'club_staff', auth.uid());
  return invitation.organization_id;
end;
$$;
revoke all on function public.accept_club_staff_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_club_staff_invitation(text) to authenticated;

-- Equipo actual + invitaciones pendientes.
create or replace function public.list_club_team(target_org uuid)
returns table (kind text, ref_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select 'member'::text, s.user_id, u.email::text, s.created_at
  from public.club_staff s join auth.users u on u.id = s.user_id where s.organization_id = target_org
  union all
  select 'invitation'::text, i.id, i.email, i.created_at
  from public.club_staff_invitations i where i.organization_id = target_org and i.accepted_at is null and i.expires_at > now()
  order by 4 desc;
end;
$$;
revoke all on function public.list_club_team(uuid) from public, anon, authenticated;
grant execute on function public.list_club_team(uuid) to authenticated;

create or replace function public.revoke_club_staff_invitation(target_org uuid, target_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  delete from public.club_staff_invitations where id = target_invitation and organization_id = target_org and accepted_at is null;
end;
$$;
revoke all on function public.revoke_club_staff_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_club_staff_invitation(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
