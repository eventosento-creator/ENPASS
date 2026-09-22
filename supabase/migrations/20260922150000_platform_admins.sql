-- Super-admin de plataforma: un usuario marcado acá pasa can_manage_org / is_org_member
-- para CUALQUIER organización, sin tener que ser miembro de cada una. Esto es el mismo
-- choke-point que ya usan ~90 RPCs/policies en todo el sistema, así que extenderlo alcanza
-- para dar acceso total sin tocar cada policy una por una.
--
-- A propósito NO hay ninguna forma de auto-agregarse acá desde la app: esta tabla se carga
-- solo por SQL directo en el panel de Supabase, nunca desde una acción de usuario.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy platform_admins_self_select on public.platform_admins
  for select using (user_id = (select auth.uid()));

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_manage_org(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

insert into public.platform_admins (user_id)
select id from auth.users where email = 'enpass.gf@gmail.com'
on conflict (user_id) do nothing;
