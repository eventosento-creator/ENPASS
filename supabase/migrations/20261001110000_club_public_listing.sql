-- Landing pública de clubes (/clubes) + alta de socios self-serve. Dos aprobaciones separadas,
-- confirmado con el dueño:
--   1) Que el club aparezca en el directorio público lo aprueba la cuenta ENPASS
--      (platform_admins, ya existe desde 20260922150000). Prende el toggle el club -> queda
--      'pending' -> un admin ENPASS lo revisa desde /app/admin.
--   2) Cada solicitud de "quiero ser socio" la aprueba el club mismo (no ENPASS), igual que
--      hoy aprueba altas manuales — solo que ahora puede llegar también desde el formulario
--      público en vez de cargarlas a mano.

alter table public.club_settings add column public_description text check (public_description is null or char_length(public_description) <= 600);
alter table public.club_settings add column public_listing_status text not null default 'none'
  check (public_listing_status in ('none', 'pending', 'approved', 'rejected'));
alter table public.club_settings add column public_listing_requested_at timestamptz;
alter table public.club_settings add column public_listing_reviewed_at timestamptz;
alter table public.club_settings add column public_listing_reviewed_by uuid references auth.users(id);
alter table public.club_settings add column public_listing_rejection_reason text;

-- El club prende/apaga su intención de estar público. Prender SIEMPRE pasa por revisión de
-- ENPASS salvo que ya estuviera aprobado de antes (no hace falta re-aprobar por editar la
-- descripción). Apagar es inmediato, sin pedirle permiso a nadie para dejar de mostrarse.
create function public.set_club_public_listing(target_org uuid, target_want_public boolean, target_description text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  insert into public.club_settings (organization_id, public_description)
  values (target_org, nullif(trim(coalesce(target_description, '')), ''))
  on conflict (organization_id) do update set public_description = nullif(trim(coalesce(target_description, '')), '');

  select public_listing_status into current_status from public.club_settings where organization_id = target_org;

  if target_want_public then
    update public.club_settings set
      public_listing_status = case when current_status = 'approved' then 'approved' else 'pending' end,
      public_listing_requested_at = case when current_status = 'approved' then public_listing_requested_at else now() end,
      public_listing_rejection_reason = case when current_status = 'approved' then public_listing_rejection_reason else null end
    where organization_id = target_org;
  else
    update public.club_settings set public_listing_status = 'none' where organization_id = target_org;
  end if;
end;
$$;
revoke all on function public.set_club_public_listing(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_club_public_listing(uuid, boolean, text) to authenticated;

-- Solo ENPASS (platform_admins) puede aprobar o rechazar que un club aparezca en /clubes.
create function public.review_club_public_listing(target_org uuid, target_approve boolean, target_rejection_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.club_settings set
    public_listing_status = case when target_approve then 'approved' else 'rejected' end,
    public_listing_reviewed_at = now(),
    public_listing_reviewed_by = auth.uid(),
    public_listing_rejection_reason = case when target_approve then null else nullif(trim(coalesce(target_rejection_reason, '')), '') end
  where organization_id = target_org;
end;
$$;
revoke all on function public.review_club_public_listing(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_club_public_listing(uuid, boolean, text) to authenticated;

-- Lecturas públicas del directorio: funciones SECURITY DEFINER (mismo motivo que
-- get_public_events_discovery necesita RLS en organizations/venues, pero acá evitamos abrir
-- una policy pública nueva en organizations — solo exponen lo que ya filtran adentro).
create function public.get_public_clubs_discovery()
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, category_count bigint)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color,
    (select count(*) from public.membership_categories mc where mc.organization_id = o.id and mc.active = true)
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where cs.enabled = true and cs.public_listing_status = 'approved'
  order by o.name;
$$;
revoke all on function public.get_public_clubs_discovery() from public;
grant execute on function public.get_public_clubs_discovery() to anon, authenticated;

create function public.get_public_club_profile(target_slug text)
returns table (organization_id uuid, slug text, name text, description text, logo_url text, accent_color text, currency char(3))
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, cs.public_description, cs.brand_logo_url, cs.brand_accent_color, o.default_currency
  from public.organizations o
  join public.club_settings cs on cs.organization_id = o.id
  where o.slug = target_slug and cs.enabled = true and cs.public_listing_status = 'approved';
$$;
revoke all on function public.get_public_club_profile(text) from public;
grant execute on function public.get_public_club_profile(text) to anon, authenticated;

create function public.get_public_club_categories(target_org uuid)
returns table (id uuid, name text, monthly_fee_amount bigint)
language sql stable security definer set search_path = '' as $$
  select mc.id, mc.name, mc.monthly_fee_amount
  from public.membership_categories mc
  join public.club_settings cs on cs.organization_id = mc.organization_id
  where mc.organization_id = target_org and mc.active = true
    and cs.enabled = true and cs.public_listing_status = 'approved'
  order by mc.sort_order, mc.name;
$$;
revoke all on function public.get_public_club_categories(uuid) from public;
grant execute on function public.get_public_club_categories(uuid) to anon, authenticated;

-- Solicitudes públicas de alta de socio ("quiero ser socio"). Quedan pendientes hasta que el
-- club (no ENPASS) las apruebe o rechace desde su panel — aprobación la hace el propio club,
-- igual que si cargara el alta a mano.
create table public.club_membership_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_category_id uuid references public.membership_categories(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  document text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  created_membership_id uuid references public.memberships(id) on delete set null,
  created_at timestamptz not null default now()
);
create index club_membership_requests_org_status_idx on public.club_membership_requests(organization_id, status);

alter table public.club_membership_requests enable row level security;
-- Sin policy de insert/update: todo pasa por las funciones SECURITY DEFINER de abajo.
create policy club_membership_requests_select on public.club_membership_requests for select to authenticated
  using ((select public.can_manage_club(organization_id)));
grant select on public.club_membership_requests to authenticated;

create function public.submit_club_membership_request(
  target_org uuid, target_category uuid, target_first_name text, target_last_name text,
  target_email text, target_phone text, target_document text, target_message text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; listing_status text; club_is_enabled boolean;
begin
  select public_listing_status, enabled into listing_status, club_is_enabled
  from public.club_settings where organization_id = target_org;
  if listing_status is distinct from 'approved' or club_is_enabled is not true then
    raise exception 'CLUB_NOT_PUBLIC' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_categories where id = target_category and organization_id = target_org and active = true) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(target_first_name, ''))) < 1 or char_length(trim(coalesce(target_last_name, ''))) < 1
    or target_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_DATA' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.club_membership_requests
    where organization_id = target_org and lower(email) = lower(trim(target_email)) and status = 'pending'
  ) then
    raise exception 'DUPLICATE_REQUEST' using errcode = 'P0001';
  end if;

  insert into public.club_membership_requests
    (organization_id, membership_category_id, first_name, last_name, email, phone, document, message)
  values (
    target_org, target_category, trim(target_first_name), trim(target_last_name), lower(trim(target_email)),
    nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''), nullif(trim(coalesce(target_message, '')), '')
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text) to anon, authenticated;

-- Aprobar reusa create_membership tal cual (misma validación/alta de cliente/cuota/mail-data
-- que el alta manual), solo que además cierra la solicitud. El admin del club pone el número
-- de socio al aprobar, igual que en el alta manual.
create function public.approve_club_membership_request(target_request uuid, target_member_number text)
returns table (
  membership_id uuid, due_id uuid, customer_email text, customer_first_name text,
  organization_name text, category_name text, due_period date, due_amount bigint, due_date date,
  brand_logo_url text, brand_name text, brand_accent_color text
) language plpgsql security definer set search_path = '' as $$
declare req public.club_membership_requests; result_row record;
begin
  select * into req from public.club_membership_requests where id = target_request;
  if not found or auth.uid() is null or not public.can_manage_club(req.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if req.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_REVIEWED' using errcode = 'P0001';
  end if;

  select * into result_row from public.create_membership(
    req.organization_id, req.membership_category_id, target_member_number,
    req.first_name, req.last_name, req.email, req.phone, req.document, null
  );

  update public.club_membership_requests set
    status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), created_membership_id = result_row.membership_id
  where id = target_request;

  return query select result_row.membership_id, result_row.due_id, result_row.customer_email, result_row.customer_first_name,
    result_row.organization_name, result_row.category_name, result_row.due_period, result_row.due_amount, result_row.due_date,
    result_row.brand_logo_url, result_row.brand_name, result_row.brand_accent_color;
end;
$$;
revoke all on function public.approve_club_membership_request(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_club_membership_request(uuid, text) to authenticated;

create function public.reject_club_membership_request(target_request uuid, target_rejection_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare req public.club_membership_requests;
begin
  select * into req from public.club_membership_requests where id = target_request;
  if not found or auth.uid() is null or not public.can_manage_club(req.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if req.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_REVIEWED' using errcode = 'P0001';
  end if;
  update public.club_membership_requests set
    status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(),
    rejection_reason = nullif(trim(coalesce(target_rejection_reason, '')), '')
  where id = target_request;
end;
$$;
revoke all on function public.reject_club_membership_request(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_club_membership_request(uuid, text) to authenticated;
