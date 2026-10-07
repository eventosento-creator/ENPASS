-- Cargo (etiqueta) de cada colaborador del club, ej. "Tesorero". Por ahora es solo informativo:
-- todos los colaboradores tienen el mismo acceso (socios, categorías, divisiones, cuotas y reportes).
-- El sistema de roles con permisos distintos queda para más adelante.

alter table public.club_staff add column if not exists title text check (title is null or char_length(title) <= 60);
alter table public.club_staff_invitations add column if not exists title text check (title is null or char_length(title) <= 60);

drop function if exists public.create_club_staff_invitation(uuid, text, text);
create or replace function public.create_club_staff_invitation(target_org uuid, target_email text, target_token_hash text, target_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid; normalized text := lower(trim(target_email));
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  delete from public.club_staff_invitations where organization_id = target_org and lower(email) = normalized and accepted_at is null;
  insert into public.club_staff_invitations (organization_id, email, token_hash, invited_by, title)
  values (target_org, normalized, target_token_hash, auth.uid(), nullif(trim(coalesce(target_title, '')), '')) returning id into invitation_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club_staff.invited', 'club_staff_invitation', invitation_id);
  return invitation_id;
end;
$$;
revoke all on function public.create_club_staff_invitation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_club_staff_invitation(uuid, text, text, text) to authenticated;

create or replace function public.accept_club_staff_invitation(raw_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.club_staff_invitations; account_email text;
begin
  if auth.uid() is null then return null; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  select * into invitation from public.club_staff_invitations
  where token_hash = raw_token_hash and accepted_at is null and expires_at > now() for update;
  if not found or account_email is distinct from lower(invitation.email) then return null; end if;
  insert into public.club_staff (organization_id, user_id, created_by, title)
  values (invitation.organization_id, auth.uid(), invitation.invited_by, invitation.title)
  on conflict (organization_id, user_id) do update set title = coalesce(excluded.title, public.club_staff.title);
  update public.club_staff_invitations set accepted_at = now() where id = invitation.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (invitation.organization_id, auth.uid(), 'club_staff.accepted', 'club_staff', auth.uid());
  return invitation.organization_id;
end;
$$;
revoke all on function public.accept_club_staff_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_club_staff_invitation(text) to authenticated;

-- Cambiar el cargo de alguien que ya está en el equipo.
create or replace function public.set_club_staff_title(target_org uuid, target_user uuid, target_title text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.club_staff set title = nullif(trim(coalesce(target_title, '')), '') where organization_id = target_org and user_id = target_user;
end;
$$;
revoke all on function public.set_club_staff_title(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_club_staff_title(uuid, uuid, text) to authenticated;

drop function if exists public.list_club_team(uuid);
create or replace function public.list_club_team(target_org uuid)
returns table (kind text, ref_id uuid, email text, created_at timestamptz, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select 'member'::text, s.user_id, u.email::text, s.created_at, s.title
  from public.club_staff s join auth.users u on u.id = s.user_id where s.organization_id = target_org
  union all
  select 'invitation'::text, i.id, i.email, i.created_at, i.title
  from public.club_staff_invitations i where i.organization_id = target_org and i.accepted_at is null and i.expires_at > now()
  order by 4 desc;
end;
$$;
revoke all on function public.list_club_team(uuid) from public, anon, authenticated;
grant execute on function public.list_club_team(uuid) to authenticated;

notify pgrst, 'reload schema';
