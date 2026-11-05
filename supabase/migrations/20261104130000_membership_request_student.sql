-- Solicitud pública de ingreso con alumno a cargo de un tutor (ver 20261104120000_member_guardian.sql).
-- Quien completa el formulario es el tutor; el alumno viaja en la solicitud y se da de alta al aprobarla.

alter table public.club_membership_requests
  add column if not exists student_first_name text check (student_first_name is null or char_length(trim(student_first_name)) between 1 and 80),
  add column if not exists student_last_name text check (student_last_name is null or char_length(trim(student_last_name)) between 1 and 80),
  add column if not exists student_document text check (student_document is null or char_length(student_document) <= 20),
  add column if not exists birth_date date;

drop function if exists public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid);
create function public.submit_club_membership_request(
  target_org uuid, target_category uuid, target_first_name text, target_last_name text, target_email text,
  target_phone text, target_document text, target_message text, target_division uuid default null,
  target_student_first_name text default null, target_student_last_name text default null, target_student_document text default null, target_birth_date date default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid; listing_status text; club_is_enabled boolean;
  student_first text := nullif(trim(coalesce(target_student_first_name, '')), '');
  student_last text := nullif(trim(coalesce(target_student_last_name, '')), '');
begin
  select public_listing_status, enabled into listing_status, club_is_enabled
  from public.club_settings where organization_id = target_org;
  if listing_status is distinct from 'approved' or club_is_enabled is not true then
    raise exception 'CLUB_NOT_PUBLIC' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.membership_categories where id = target_category and organization_id = target_org and active = true) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if target_division is not null and not exists (select 1 from public.divisions where id = target_division and organization_id = target_org and active = true) then
    raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(target_first_name, ''))) < 1 or char_length(trim(coalesce(target_last_name, ''))) < 1
    or target_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_DATA' using errcode = 'P0001';
  end if;
  if student_first is not null and (student_last is null or target_birth_date is null or target_birth_date > current_date or target_birth_date < date '1900-01-01') then
    raise exception 'INVALID_STUDENT_DATA' using errcode = 'P0001';
  end if;
  -- Un mismo tutor puede tener pendientes las solicitudes de varios hijos; se repite solo la del mismo alumno.
  if exists (
    select 1 from public.club_membership_requests
    where organization_id = target_org and lower(email) = lower(trim(target_email)) and status = 'pending'
      and lower(coalesce(student_first_name, '')) = lower(coalesce(student_first, ''))
      and lower(coalesce(student_last_name, '')) = lower(coalesce(student_last, ''))
  ) then
    raise exception 'DUPLICATE_REQUEST' using errcode = 'P0001';
  end if;

  insert into public.club_membership_requests
    (organization_id, membership_category_id, division_id, first_name, last_name, email, phone, document, message,
     student_first_name, student_last_name, student_document, birth_date)
  values (
    target_org, target_category, target_division, trim(target_first_name), trim(target_last_name), lower(trim(target_email)),
    nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''), nullif(trim(coalesce(target_message, '')), ''),
    student_first, case when student_first is not null then student_last end,
    case when student_first is not null then nullif(trim(coalesce(target_student_document, '')), '') end,
    case when student_first is not null then target_birth_date end
  )
  returning id into new_id;
  return new_id;
end;
$$;
-- Solo el servidor la llama (con tope por IP y por mail): ver 20261012120000_public_rate_limits.sql.
revoke all on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid, text, text, text, date) to service_role;

-- Aprobar: da de alta al alumno con su tutor.
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
    req.first_name, req.last_name, req.email, req.phone, req.document, null, null,
    req.student_first_name, req.student_last_name, req.student_document, req.birth_date
  );

  update public.club_membership_requests set
    status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), created_membership_id = result_row.membership_id
  where id = target_request;

  return query select result_row.membership_id, result_row.due_id, result_row.customer_email, result_row.customer_first_name,
    result_row.organization_name, result_row.category_name, result_row.due_period, result_row.due_amount, result_row.due_date,
    result_row.brand_logo_url, result_row.brand_name, result_row.brand_accent_color;
end;
$function$;
