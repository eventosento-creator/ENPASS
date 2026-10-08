-- Roles del equipo del club. Cada colaborador (club_staff) tiene un rol que define qué puede hacer:
--   admin       Administrador: socios, solicitudes, categorías, divisiones, cuotas, planes y reportes (lo que ya tenían todos).
--   treasurer   Tesorero: cuotas (generar y registrar pagos), planes de cobro y reportes. Mira socios pero no los edita.
--   coordinator Coordinador: socios, solicitudes, categorías y divisiones. No toca cobros ni ve reportes.
--   viewer      Solo lectura: ve socios, cuotas y categorías; no cambia nada.
-- Los colaboradores existentes quedan como 'admin' (no pierden nada). El dueño y los admins de la organización siempre pueden todo.
-- Identidad del club, pagos, equipo y eventos siguen siendo solo del dueño/admin de la organización.
-- Los permisos se verifican en la base (funciones y políticas), no solo en la pantalla.

-- club_staff ya tenía una columna role con un único valor ('member_staff'): se convierte en el rol real.
alter table public.club_staff drop constraint if exists club_staff_role_check;
update public.club_staff set role = 'admin' where role = 'member_staff';
alter table public.club_staff alter column role set default 'admin';
alter table public.club_staff add constraint club_staff_role_check check (role in ('admin', 'treasurer', 'coordinator', 'viewer'));
alter table public.club_staff_invitations add column if not exists role text not null default 'admin' check (role in ('admin', 'treasurer', 'coordinator', 'viewer'));

-- perm: 'members' | 'structure' | 'dues' | 'reports'
create or replace function public.club_permission(target_org uuid, perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_org(target_org) or exists (
    select 1 from public.club_staff s
    where s.organization_id = target_org and s.user_id = (select auth.uid())
      and case s.role
        when 'admin' then perm in ('members', 'structure', 'dues', 'reports')
        when 'treasurer' then perm in ('dues', 'reports')
        when 'coordinator' then perm in ('members', 'structure')
        else false
      end
  );
$$;
revoke all on function public.club_permission(uuid, text) from public, anon, authenticated;
grant execute on function public.club_permission(uuid, text) to authenticated;

-- Invitaciones y equipo con rol.
drop function if exists public.create_club_staff_invitation(uuid, text, text, text);
create or replace function public.create_club_staff_invitation(target_org uuid, target_email text, target_token_hash text, target_title text default null, target_role text default 'admin')
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid; normalized text := lower(trim(target_email));
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_role not in ('admin', 'treasurer', 'coordinator', 'viewer') then
    raise exception 'INVALID_INVITATION' using errcode = 'P0001';
  end if;
  delete from public.club_staff_invitations where organization_id = target_org and lower(email) = normalized and accepted_at is null;
  insert into public.club_staff_invitations (organization_id, email, token_hash, invited_by, title, role)
  values (target_org, normalized, target_token_hash, auth.uid(), nullif(trim(coalesce(target_title, '')), ''), target_role) returning id into invitation_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'club_staff.invited', 'club_staff_invitation', invitation_id, jsonb_build_object('role', target_role));
  return invitation_id;
end;
$$;
revoke all on function public.create_club_staff_invitation(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_club_staff_invitation(uuid, text, text, text, text) to authenticated;

create or replace function public.accept_club_staff_invitation(raw_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.club_staff_invitations; account_email text;
begin
  if auth.uid() is null then return null; end if;
  select lower(email) into account_email from auth.users where id = auth.uid();
  select * into invitation from public.club_staff_invitations
  where token_hash = raw_token_hash and accepted_at is null and expires_at > now() for update;
  if not found or account_email is distinct from lower(invitation.email) then return null; end if;
  insert into public.club_staff (organization_id, user_id, created_by, title, role)
  values (invitation.organization_id, auth.uid(), invitation.invited_by, invitation.title, invitation.role)
  on conflict (organization_id, user_id) do update set title = coalesce(excluded.title, public.club_staff.title), role = excluded.role;
  update public.club_staff_invitations set accepted_at = now() where id = invitation.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (invitation.organization_id, auth.uid(), 'club_staff.accepted', 'club_staff', auth.uid());
  return invitation.organization_id;
end;
$$;
revoke all on function public.accept_club_staff_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_club_staff_invitation(text) to authenticated;

create or replace function public.set_club_staff_role(target_org uuid, target_user uuid, target_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_role not in ('admin', 'treasurer', 'coordinator', 'viewer') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  update public.club_staff set role = target_role where organization_id = target_org and user_id = target_user;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'club_staff.role_changed', 'club_staff', target_user, jsonb_build_object('role', target_role));
end;
$$;
revoke all on function public.set_club_staff_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_club_staff_role(uuid, uuid, text) to authenticated;

drop function if exists public.list_club_team(uuid);
create or replace function public.list_club_team(target_org uuid)
returns table (kind text, ref_id uuid, email text, created_at timestamptz, title text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select 'member'::text, s.user_id, u.email::text, s.created_at, s.title, s.role
  from public.club_staff s join auth.users u on u.id = s.user_id where s.organization_id = target_org
  union all
  select 'invitation'::text, i.id, i.email, i.created_at, i.title, i.role
  from public.club_staff_invitations i where i.organization_id = target_org and i.accepted_at is null and i.expires_at > now()
  order by 4 desc;
end;
$$;
revoke all on function public.list_club_team(uuid) from public, anon, authenticated;
grant execute on function public.list_club_team(uuid) to authenticated;

-- Escrituras directas a las tablas: política "restrictiva" que se suma a las existentes (todas deben cumplirse).
do $$
declare t record;
begin
  for t in select * from (values
    ('memberships', 'members'), ('membership_division_enrollments', 'members'),
    ('membership_categories', 'structure'), ('divisions', 'structure'),
    ('membership_dues', 'dues'), ('division_dues', 'dues'), ('membership_plans', 'dues')
  ) as v(tbl, perm) loop
    execute format('drop policy if exists %I on public.%I', t.tbl || '_role_insert', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_role_update', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_role_delete', t.tbl);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.club_permission(organization_id, %L)))', t.tbl || '_role_insert', t.tbl, t.perm);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using ((select public.club_permission(organization_id, %L))) with check ((select public.club_permission(organization_id, %L)))', t.tbl || '_role_update', t.tbl, t.perm, t.perm);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using ((select public.club_permission(organization_id, %L)))', t.tbl || '_role_delete', t.tbl, t.perm);
  end loop;
end $$;

-- Funciones de escritura y reportes: pasan a pedir el permiso que corresponde (antes pedían solo "ser del equipo").
-- approve_club_membership_request: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.approve_club_membership_request(target_request uuid, target_member_number text)
 RETURNS TABLE(membership_id uuid, due_id uuid, customer_email text, customer_first_name text, organization_name text, category_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare req public.club_membership_requests; result_row record;
begin
  select * into req from public.club_membership_requests where id = target_request;
  if not found or auth.uid() is null or not public.club_permission(req.organization_id, 'members') then
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
$function$;

-- create_membership: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.create_membership(target_org uuid, target_category uuid, target_member_number text, target_first_name text, target_last_name text, target_email text, target_phone text, target_document text, target_customer_id uuid DEFAULT NULL::uuid, target_plan uuid DEFAULT NULL::uuid)
 RETURNS TABLE(membership_id uuid, due_id uuid, customer_email text, customer_first_name text, organization_name text, category_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  resolved_customer_id uuid;
  new_membership_id uuid;
  new_due_id uuid;
  monthly_fee bigint;
  first_period date;
  category_label text;
  org_name text;
  buyer_email text;
  buyer_first_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'members') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select mc.monthly_fee_amount, mc.name into monthly_fee, category_label from public.membership_categories mc
  where mc.id = target_category and mc.organization_id = target_org;
  if monthly_fee is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  if target_plan is not null and not exists (select 1 from public.membership_plans where id = target_plan and organization_id = target_org and active) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Precio de la primera cuota según el plan del socio.
  monthly_fee := public.apply_membership_plan(monthly_fee, target_plan);
  select o.name into org_name from public.organizations o where o.id = target_org;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = target_org;

  if target_customer_id is not null then
    select id into resolved_customer_id from public.customers where id = target_customer_id and organization_id = target_org;
    if resolved_customer_id is null then raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0001'; end if;
  else
    if char_length(trim(coalesce(target_member_number, ''))) < 1 or char_length(trim(coalesce(target_first_name, ''))) < 1
      or char_length(trim(coalesce(target_last_name, ''))) < 1 or target_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'INVALID_MEMBER_DATA' using errcode = 'P0001';
    end if;

    select id into resolved_customer_id from public.customers
    where organization_id = target_org and lower(email) = lower(trim(target_email));

    if resolved_customer_id is null and target_document is not null and trim(target_document) <> '' then
      select id into resolved_customer_id from public.customers
      where organization_id = target_org and document = trim(target_document)
      limit 1;
    end if;

    if resolved_customer_id is null then
      insert into public.customers (organization_id, first_name, last_name, email, phone, document)
      values (target_org, trim(target_first_name), trim(target_last_name), lower(trim(target_email)), nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''))
      returning id into resolved_customer_id;
    else
      update public.customers set
        first_name = trim(target_first_name), last_name = trim(target_last_name),
        phone = coalesce(nullif(trim(coalesce(target_phone, '')), ''), phone),
        document = coalesce(nullif(trim(coalesce(target_document, '')), ''), document)
      where id = resolved_customer_id;
    end if;
  end if;

  if char_length(trim(coalesce(target_member_number, ''))) < 1 then
    raise exception 'INVALID_MEMBER_DATA' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.memberships m where m.organization_id = target_org and m.customer_id = resolved_customer_id) then
    raise exception 'CUSTOMER_ALREADY_MEMBER' using errcode = 'P0001';
  end if;

  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = resolved_customer_id;

  insert into public.memberships (organization_id, customer_id, membership_category_id, member_number, created_by, membership_plan_id)
  values (target_org, resolved_customer_id, target_category, trim(target_member_number), auth.uid(), target_plan)
  returning id into new_membership_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  if monthly_fee > 0 then
    insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
    values (target_org, new_membership_id, first_period, monthly_fee, public.membership_due_date_for_period(current_date, first_period))
    returning id into new_due_id;
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'membership.created', 'membership', new_membership_id, jsonb_build_object('customer_id', resolved_customer_id, 'member_number', trim(target_member_number), 'linked_existing', target_customer_id is not null));

  return query select new_membership_id, new_due_id, buyer_email, buyer_first_name, org_name, category_label, first_period, monthly_fee,
    public.membership_due_date_for_period(current_date, first_period), logo_url, name_override, accent_color;
exception when unique_violation then
  raise exception 'MEMBER_NUMBER_TAKEN' using errcode = 'P0001';
end;
$function$;

-- enroll_membership_in_division: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.enroll_membership_in_division(target_membership uuid, target_division uuid)
 RETURNS TABLE(enrollment_id uuid, due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  membership_row public.memberships;
  division_row public.divisions;
  new_enrollment_id uuid;
  new_due_id uuid;
  division_fee bigint;
  first_period date;
  buyer_email text;
  buyer_first_name text;
  org_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.club_permission(membership_row.organization_id, 'members') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into division_row from public.divisions where id = target_division and organization_id = membership_row.organization_id;
  if not found then raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.membership_division_enrollments (organization_id, membership_id, division_id, created_by)
  values (membership_row.organization_id, target_membership, target_division, auth.uid())
  on conflict (membership_id, division_id) do update set status = 'active', starts_at = current_date
  returning id into new_enrollment_id;

  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = membership_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = membership_row.organization_id;

  first_period := (date_trunc('month', current_date) + interval '1 month')::date;
  division_fee := public.apply_membership_plan(division_row.monthly_fee_amount, membership_row.membership_plan_id);
  if division_fee > 0 then
    insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
    values (membership_row.organization_id, new_enrollment_id, first_period, division_fee,
      public.membership_due_date_for_period(current_date, first_period))
    on conflict on constraint division_dues_enrollment_id_period_key do nothing
    returning id into new_due_id;
  end if;

  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (membership_row.organization_id, auth.uid(), 'division.enrolled', 'membership_division_enrollment', new_enrollment_id,
    jsonb_build_object('membership_id', target_membership, 'division_id', target_division));

  return query select new_enrollment_id, new_due_id, buyer_email, buyer_first_name, org_name, division_row.name,
    first_period, division_fee, public.membership_due_date_for_period(current_date, first_period),
    logo_url, name_override, accent_color;
end;
$function$;

-- reject_club_membership_request: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.reject_club_membership_request(target_request uuid, target_rejection_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare req public.club_membership_requests;
begin
  select * into req from public.club_membership_requests where id = target_request;
  if not found or auth.uid() is null or not public.club_permission(req.organization_id, 'members') then
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
$function$;

-- remove_membership_from_division: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.remove_membership_from_division(target_enrollment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare enrollment_row public.membership_division_enrollments;
begin
  select * into enrollment_row from public.membership_division_enrollments where id = target_enrollment;
  if not found or auth.uid() is null or not public.club_permission(enrollment_row.organization_id, 'members') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.membership_division_enrollments set status = 'inactive' where id = target_enrollment;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (enrollment_row.organization_id, auth.uid(), 'division.unenrolled', 'membership_division_enrollment', target_enrollment);
end;
$function$;

-- set_membership_status: requiere permiso 'members'
CREATE OR REPLACE FUNCTION public.set_membership_status(target_membership uuid, target_status text, target_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare membership_row public.memberships;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.club_permission(membership_row.organization_id, 'members') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_status not in ('active', 'suspended', 'cancelled') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update public.memberships set
    status = target_status, status_reason = nullif(trim(coalesce(target_reason, '')), ''),
    status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
  where id = target_membership;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (membership_row.organization_id, auth.uid(), 'membership.status_changed', 'membership', target_membership,
    jsonb_build_object('status', membership_row.status), jsonb_build_object('status', target_status, 'reason', target_reason));
end;
$function$;

-- delete_division: requiere permiso 'structure'
CREATE OR REPLACE FUNCTION public.delete_division(target_org uuid, target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.club_permission(target_org, 'structure') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.divisions where id = target_id and organization_id = target_org) then
    raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership_division_enrollments where division_id = target_id) then
    raise exception 'DIVISION_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.divisions where id = target_id and organization_id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.division.deleted', 'division', target_id);
end;
$function$;

-- delete_membership_category: requiere permiso 'structure'
CREATE OR REPLACE FUNCTION public.delete_membership_category(target_org uuid, target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.club_permission(target_org, 'structure') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_categories where id = target_id and organization_id = target_org) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships where membership_category_id = target_id) then
    raise exception 'CATEGORY_IN_USE' using errcode = 'P0001';
  end if;
  -- Las divisiones de la categoría quedan sin categoría; las solicitudes pendientes pierden la categoría (FK set null).
  delete from public.membership_categories where id = target_id and organization_id = target_org;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_org, auth.uid(), 'club.category.deleted', 'membership_category', target_id);
end;
$function$;

-- set_division_category: requiere permiso 'structure'
CREATE OR REPLACE FUNCTION public.set_division_category(target_division uuid, target_category uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare division_org uuid;
begin
  select organization_id into division_org from public.divisions where id = target_division;
  if division_org is null or auth.uid() is null or not public.club_permission(division_org, 'structure') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_category is not null and not exists (
    select 1 from public.membership_categories where id = target_category and organization_id = division_org
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  update public.divisions set membership_category_id = target_category, updated_at = now() where id = target_division;
end;
$function$;

-- upsert_division: requiere permiso 'structure'
CREATE OR REPLACE FUNCTION public.upsert_division(target_org uuid, target_id uuid, target_name text, target_monthly_fee_amount bigint, target_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare division_id uuid;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'structure') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 60 or target_monthly_fee_amount < 0 then
    raise exception 'INVALID_DIVISION' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.divisions (organization_id, name, monthly_fee_amount, active)
    values (target_org, trim(target_name), target_monthly_fee_amount, coalesce(target_active, true))
    returning id into division_id;
  else
    update public.divisions
    set name = trim(target_name), monthly_fee_amount = target_monthly_fee_amount, active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org
    returning id into division_id;
    if division_id is null then raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return division_id;
exception when unique_violation then
  raise exception 'DIVISION_NAME_TAKEN' using errcode = 'P0001';
end;
$function$;

-- upsert_membership_category: requiere permiso 'structure'
CREATE OR REPLACE FUNCTION public.upsert_membership_category(target_org uuid, target_id uuid, target_name text, target_monthly_fee_amount bigint, target_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare category_id uuid;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'structure') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 1 and 60 or target_monthly_fee_amount < 0 then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.membership_categories (organization_id, name, monthly_fee_amount, active)
    values (target_org, trim(target_name), target_monthly_fee_amount, coalesce(target_active, true))
    returning id into category_id;
  else
    update public.membership_categories
    set name = trim(target_name), monthly_fee_amount = target_monthly_fee_amount, active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org
    returning id into category_id;
    if category_id is null then raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return category_id;
end;
$function$;

-- create_division_due: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.create_division_due(target_enrollment uuid, target_period date, target_amount bigint, target_due_date date)
 RETURNS TABLE(due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  enrollment_row public.membership_division_enrollments;
  membership_row public.memberships;
  division_row public.divisions;
  new_due_id uuid;
  buyer_email text;
  buyer_first_name text;
  org_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  select * into enrollment_row from public.membership_division_enrollments where id = target_enrollment;
  if not found or auth.uid() is null or not public.club_permission(enrollment_row.organization_id, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  select * into membership_row from public.memberships where id = enrollment_row.membership_id;
  select * into division_row from public.divisions where id = enrollment_row.division_id;
  insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
  values (enrollment_row.organization_id, target_enrollment, date_trunc('month', target_period)::date, target_amount, target_due_date)
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning id into new_due_id;
  if new_due_id is null then return; end if;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = enrollment_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = enrollment_row.organization_id;
  return query select new_due_id, buyer_email, buyer_first_name, org_name, division_row.name,
    date_trunc('month', target_period)::date, target_amount, target_due_date, logo_url, name_override, accent_color;
end;
$function$;

-- create_membership_due: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.create_membership_due(target_membership uuid, target_period date, target_amount bigint, target_due_date date)
 RETURNS TABLE(due_id uuid, customer_email text, customer_first_name text, organization_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  membership_row public.memberships;
  new_due_id uuid;
  buyer_email text;
  buyer_first_name text;
  org_name text;
  logo_url text;
  name_override text;
  accent_color text;
begin
  select * into membership_row from public.memberships where id = target_membership;
  if not found or auth.uid() is null or not public.club_permission(membership_row.organization_id, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  values (membership_row.organization_id, target_membership, date_trunc('month', target_period)::date, target_amount, target_due_date)
  on conflict (membership_id, period) do nothing
  returning id into new_due_id;
  if new_due_id is null then return; end if;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = membership_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = membership_row.organization_id;
  return query select new_due_id, buyer_email, buyer_first_name, org_name, date_trunc('month', target_period)::date, target_amount, target_due_date,
    logo_url, name_override, accent_color;
end;
$function$;

-- delete_membership_plan: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.delete_membership_plan(target_org uuid, target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.club_permission(target_org, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_plans where id = target_id and organization_id = target_org) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships where membership_plan_id = target_id) then
    raise exception 'PLAN_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.membership_plans where id = target_id and organization_id = target_org;
end;
$function$;

-- generate_division_dues_for_period: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.generate_division_dues_for_period(target_division uuid, target_period date)
 RETURNS TABLE(due_id uuid, customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare division_row public.divisions; org_name text; logo_url text; name_override text; accent_color text;
begin
  select * into division_row from public.divisions where id = target_division;
  if not found or auth.uid() is null or not public.club_permission(division_row.organization_id, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select o.name into org_name from public.organizations o where o.id = division_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = division_row.organization_id;
  return query
  insert into public.division_dues (organization_id, enrollment_id, period, amount, due_date)
  select division_row.organization_id, e.id, date_trunc('month', target_period)::date, public.apply_membership_plan(division_row.monthly_fee_amount, mem.membership_plan_id),
    public.membership_due_date_for_period(e.starts_at, target_period)
  from public.membership_division_enrollments e
  join public.memberships mem on mem.id = e.membership_id
  where e.division_id = target_division and e.status = 'active'
    and public.apply_membership_plan(division_row.monthly_fee_amount, mem.membership_plan_id) > 0
  on conflict on constraint division_dues_enrollment_id_period_key do nothing
  returning
    division_dues.id,
    (select c.email from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    (select c.first_name from public.customers c join public.memberships m on m.customer_id = c.id join public.membership_division_enrollments e2 on e2.membership_id = m.id where e2.id = division_dues.enrollment_id),
    org_name, division_row.name, division_dues.period, division_dues.amount, division_dues.due_date,
    logo_url, name_override, accent_color;
end;
$function$;

-- generate_dues_for_period: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.generate_dues_for_period(target_org uuid, target_category uuid, target_period date)
 RETURNS TABLE(due_id uuid, customer_email text, customer_first_name text, organization_name text, due_period date, due_amount bigint, due_date date, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_name text; logo_url text; name_override text; accent_color text;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select o.name into org_name from public.organizations o where o.id = target_org;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = target_org;
  return query
  insert into public.membership_dues (organization_id, membership_id, period, amount, due_date)
  select target_org, m.id, date_trunc('month', target_period)::date, public.apply_membership_plan(mc.monthly_fee_amount, m.membership_plan_id),
    public.membership_due_date_for_period(m.starts_at, target_period)
  from public.memberships m
  join public.membership_categories mc on mc.id = m.membership_category_id
  where m.organization_id = target_org and m.status = 'active'
    and public.apply_membership_plan(mc.monthly_fee_amount, m.membership_plan_id) > 0
    and (target_category is null or m.membership_category_id = target_category)
  on conflict (membership_id, period) do nothing
  returning
    membership_dues.id,
    (select c.email from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    (select c.first_name from public.customers c join public.memberships m2 on m2.customer_id = c.id where m2.id = membership_dues.membership_id),
    org_name,
    membership_dues.period,
    membership_dues.amount,
    membership_dues.due_date,
    logo_url, name_override, accent_color;
end;
$function$;

-- record_manual_division_due_payment: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.record_manual_division_due_payment(target_due uuid, target_paid_amount bigint, target_payment_method text, target_payment_reference text)
 RETURNS TABLE(customer_email text, customer_first_name text, organization_name text, division_name text, due_period date, paid_amount bigint, payment_method text, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  due_row public.division_dues; enrollment_row public.membership_division_enrollments; membership_row public.memberships;
  division_row public.divisions; buyer_email text; buyer_first_name text; org_name text;
  logo_url text; name_override text; accent_color text;
begin
  select * into due_row from public.division_dues where id = target_due;
  if not found then raise exception 'DUE_NOT_FOUND' using errcode = 'P0001'; end if;
  select * into enrollment_row from public.membership_division_enrollments where id = due_row.enrollment_id;
  if auth.uid() is null or not public.club_permission(enrollment_row.organization_id, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if due_row.paid_at is not null then raise exception 'DUE_ALREADY_PAID' using errcode = 'P0001'; end if;
  if target_payment_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;
  update public.division_dues set
    paid_at = now(), paid_amount = target_paid_amount, payment_method = target_payment_method,
    payment_reference = nullif(trim(coalesce(target_payment_reference, '')), ''), registered_by = auth.uid()
  where id = target_due;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (enrollment_row.organization_id, auth.uid(), 'division_due.paid_manual', 'division_due', target_due,
    jsonb_build_object('amount', target_paid_amount, 'method', target_payment_method));
  select * into membership_row from public.memberships where id = enrollment_row.membership_id;
  select * into division_row from public.divisions where id = enrollment_row.division_id;
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c where c.id = membership_row.customer_id;
  select o.name into org_name from public.organizations o where o.id = enrollment_row.organization_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = enrollment_row.organization_id;
  return query select buyer_email, buyer_first_name, org_name, division_row.name, due_row.period, target_paid_amount, target_payment_method,
    logo_url, name_override, accent_color;
end;
$function$;

-- record_manual_due_payment: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.record_manual_due_payment(target_due uuid, target_paid_amount bigint, target_payment_method text, target_payment_reference text)
 RETURNS TABLE(customer_email text, customer_first_name text, organization_name text, due_period date, paid_amount bigint, payment_method text, brand_logo_url text, brand_name text, brand_accent_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare due_row public.membership_dues; org_id uuid; buyer_email text; buyer_first_name text; org_name text;
  logo_url text; name_override text; accent_color text;
begin
  select * into due_row from public.membership_dues where id = target_due;
  if not found then raise exception 'DUE_NOT_FOUND' using errcode = 'P0001'; end if;
  select organization_id into org_id from public.memberships where id = due_row.membership_id;
  if auth.uid() is null or not public.club_permission(org_id, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if due_row.paid_at is not null then raise exception 'DUE_ALREADY_PAID' using errcode = 'P0001'; end if;
  if target_payment_method not in ('cash', 'transfer', 'other') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;
  update public.membership_dues set
    paid_at = now(), paid_amount = target_paid_amount, payment_method = target_payment_method,
    payment_reference = nullif(trim(coalesce(target_payment_reference, '')), ''), registered_by = auth.uid()
  where id = target_due;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'membership_due.paid_manual', 'membership_due', target_due,
    jsonb_build_object('amount', target_paid_amount, 'method', target_payment_method));
  select c.email, c.first_name into buyer_email, buyer_first_name from public.customers c
    join public.memberships m on m.customer_id = c.id where m.id = due_row.membership_id;
  select o.name into org_name from public.organizations o where o.id = org_id;
  select cs.brand_logo_url, cs.brand_name, cs.brand_accent_color into logo_url, name_override, accent_color
  from public.club_settings cs where cs.organization_id = org_id;
  return query select buyer_email, buyer_first_name, org_name, due_row.period, target_paid_amount, target_payment_method,
    logo_url, name_override, accent_color;
end;
$function$;

-- set_membership_plan: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.set_membership_plan(target_membership uuid, target_plan uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid;
begin
  select organization_id into org from public.memberships where id = target_membership;
  if org is null or auth.uid() is null or not public.club_permission(org, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_plan is not null and not exists (select 1 from public.membership_plans where id = target_plan and organization_id = org) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001';
  end if;
  update public.memberships set membership_plan_id = target_plan, updated_at = now() where id = target_membership;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org, auth.uid(), 'membership.plan.changed', 'membership', target_membership, jsonb_build_object('plan_id', target_plan));
end;
$function$;

-- upsert_membership_plan: requiere permiso 'dues'
CREATE OR REPLACE FUNCTION public.upsert_membership_plan(target_org uuid, target_id uuid, target_name text, target_kind text, target_mode text, target_discount_bps integer, target_fixed_amount bigint, target_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare plan_id uuid;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'dues') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(target_name, ''))) not between 1 and 60 or target_kind not in ('standard', 'family', 'scholarship')
    or target_mode not in ('none', 'percent', 'fixed') or coalesce(target_discount_bps, 0) not between 0 and 10000 or coalesce(target_fixed_amount, 0) < 0 then
    raise exception 'INVALID_PLAN' using errcode = 'P0001';
  end if;
  if target_id is null then
    insert into public.membership_plans (organization_id, name, kind, pricing_mode, discount_bps, fixed_amount, active)
    values (target_org, trim(target_name), target_kind, target_mode,
      case when target_mode = 'percent' then coalesce(target_discount_bps, 0) else 0 end,
      case when target_mode = 'fixed' then coalesce(target_fixed_amount, 0) else 0 end, coalesce(target_active, true))
    returning id into plan_id;
  else
    update public.membership_plans set name = trim(target_name), kind = target_kind, pricing_mode = target_mode,
      discount_bps = case when target_mode = 'percent' then coalesce(target_discount_bps, 0) else 0 end,
      fixed_amount = case when target_mode = 'fixed' then coalesce(target_fixed_amount, 0) else 0 end,
      active = coalesce(target_active, true), updated_at = now()
    where id = target_id and organization_id = target_org returning id into plan_id;
    if plan_id is null then raise exception 'PLAN_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return plan_id;
exception when unique_violation then
  raise exception 'PLAN_NAME_TAKEN' using errcode = 'P0001';
end;
$function$;

-- get_club_report: requiere permiso 'reports'
CREATE OR REPLACE FUNCTION public.get_club_report(target_org uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  d_from date; d_to date; today date; result jsonb;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'reports') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_to <= p_from or p_to - p_from > interval '800 days' then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;
  d_from := (p_from at time zone tz)::date;
  d_to := (p_to at time zone tz)::date;   -- exclusivo
  today := (now() at time zone tz)::date;

  with all_dues as (
    select 'club'::text as kind, d.membership_id, null::uuid as division_id, d.amount, d.due_date, d.paid_at, d.paid_amount, d.payment_method
    from public.membership_dues d where d.organization_id = target_org and d.amount > 0
    union all
    select 'division'::text, e.membership_id, e.division_id, dd.amount, dd.due_date, dd.paid_at, dd.paid_amount, dd.payment_method
    from public.division_dues dd join public.membership_division_enrollments e on e.id = dd.enrollment_id
    where dd.organization_id = target_org and dd.amount > 0
  ),
  months as (
    select (date_trunc('month', (p_to - interval '1 second') at time zone tz) - (g * interval '1 month'))::date as month_start
    from generate_series(5, 0, -1) g
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', d_from, 'to', d_to),
    'members', jsonb_build_object(
      'active', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'active'),
      'suspended', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'suspended'),
      'cancelled', (select count(*) from public.memberships m where m.organization_id = target_org and m.status = 'cancelled'),
      'new_in_period', (select count(*) from public.memberships m where m.organization_id = target_org and m.created_at >= p_from and m.created_at < p_to),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'monthly_fee', c.monthly_fee_amount, 'active_members',
          (select count(*) from public.memberships m where m.membership_category_id = c.id and m.status = 'active')) order by c.sort_order, c.name)
        from public.membership_categories c where c.organization_id = target_org and c.active), '[]'::jsonb)
    ),
    'dues', jsonb_build_object(
      'issued', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.due_date >= d_from and x.due_date < d_to),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.due_date >= d_from and x.due_date < d_to)),
      'collected', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to),
        'amount', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to),
        'online_amount', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.paid_at >= p_from and x.paid_at < p_to and x.payment_method = 'mercado_pago')),
      'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', t.method, 'count', t.cnt, 'amount', t.total))
        from (select coalesce(x.payment_method, 'other') as method, count(*) as cnt, sum(coalesce(x.paid_amount, x.amount)) as total
              from all_dues x where x.paid_at >= p_from and x.paid_at < p_to group by 1) t), '[]'::jsonb),
      'pending', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at is null and x.due_date >= today),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.paid_at is null and x.due_date >= today)),
      'overdue', jsonb_build_object(
        'count', (select count(*) from all_dues x where x.paid_at is null and x.due_date < today),
        'amount', (select coalesce(sum(x.amount), 0) from all_dues x where x.paid_at is null and x.due_date < today),
        'members', (select count(distinct x.membership_id) from all_dues x where x.paid_at is null and x.due_date < today)),
      'monthly', (select jsonb_agg(jsonb_build_object('month', to_char(mo.month_start, 'YYYY-MM'),
          'collected', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x
            where (x.paid_at at time zone tz)::date >= mo.month_start and (x.paid_at at time zone tz)::date < (mo.month_start + interval '1 month')::date)) order by mo.month_start)
        from months mo)
    ),
    'divisions', coalesce((select jsonb_agg(jsonb_build_object('name', dv.name, 'category', mc.name, 'monthly_fee', dv.monthly_fee_amount,
        'enrolled', (select count(*) from public.membership_division_enrollments e where e.division_id = dv.id and e.status = 'active'),
        'collected', (select coalesce(sum(coalesce(x.paid_amount, x.amount)), 0) from all_dues x where x.division_id = dv.id and x.paid_at >= p_from and x.paid_at < p_to),
        'overdue', (select coalesce(sum(x.amount), 0) from all_dues x where x.division_id = dv.id and x.paid_at is null and x.due_date < today)) order by dv.sort_order, dv.name)
      from public.divisions dv left join public.membership_categories mc on mc.id = dv.membership_category_id
      where dv.organization_id = target_org and dv.active), '[]'::jsonb),
    'debtors', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'member_number', t.member_number, 'amount', t.total, 'dues', t.cnt, 'oldest_due', t.oldest) order by t.total desc)
      from (select c.first_name || ' ' || c.last_name as name, m.member_number, sum(x.amount) as total, count(*) as cnt, min(x.due_date) as oldest
            from all_dues x join public.memberships m on m.id = x.membership_id join public.customers c on c.id = m.customer_id
            where x.paid_at is null and x.due_date < today group by c.first_name, c.last_name, m.member_number order by 3 desc limit 10) t), '[]'::jsonb),
    'access', jsonb_build_object(
      'total', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to),
      'allowed', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result in ('allowed', 'allowed_with_debt')),
      'with_debt', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result = 'allowed_with_debt'),
      'denied', (select count(*) from public.club_access_logs l where l.organization_id = target_org and l.created_at >= p_from and l.created_at < p_to and l.result like 'denied%')
    )
  ) into result;
  return result;
end;
$function$;

-- get_club_settlements: requiere permiso 'reports'
CREATE OR REPLACE FUNCTION public.get_club_settlements(target_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mode text; pending_owed bigint; pending_count bigint; payouts jsonb;
begin
  if auth.uid() is null or not public.club_permission(target_org, 'reports') then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select club_collection_mode into mode from public.organizations where id = target_org;
  select coalesce(sum(x.gross - x.fee), 0), count(*) into pending_owed, pending_count from (
    select mp.gross_amount as gross, mp.service_fee_amount as fee from public.membership_due_payments mp
      where mp.organization_id = target_org and mp.status = 'approved' and mp.collected_by = 'enpass' and mp.payout_id is null and mp.gross_amount is not null
    union all
    select dp.gross_amount, dp.service_fee_amount from public.division_due_payments dp
      where dp.organization_id = target_org and dp.status = 'approved' and dp.collected_by = 'enpass' and dp.payout_id is null and dp.gross_amount is not null
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'created_at', p.created_at, 'paid_at', p.paid_at, 'status', p.status, 'amount', p.amount, 'payments', p.payments_count, 'reference', p.reference, 'method', p.method) order by p.created_at desc), '[]'::jsonb)
    into payouts from (select * from public.club_payouts where organization_id = target_org order by created_at desc limit 24) p;
  return jsonb_build_object('mode', mode, 'pending_amount', pending_owed, 'pending_payments', pending_count, 'payouts', payouts);
end;
$function$;

notify pgrst, 'reload schema';
