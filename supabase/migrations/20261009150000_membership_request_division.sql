-- La solicitud de "Quiero ser socio" puede llevar la división elegida (ej. C13). Es opcional.
-- Al aprobarla, la app anota al nuevo socio en esa división.

alter table public.club_membership_requests
  add column if not exists division_id uuid references public.divisions(id) on delete set null;

drop function if exists public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text);
create or replace function public.submit_club_membership_request(
  target_org uuid, target_category uuid, target_first_name text, target_last_name text, target_email text,
  target_phone text, target_document text, target_message text, target_division uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  if target_division is not null and not exists (select 1 from public.divisions where id = target_division and organization_id = target_org and active = true) then
    raise exception 'DIVISION_NOT_FOUND' using errcode = 'P0001';
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
    (organization_id, membership_category_id, division_id, first_name, last_name, email, phone, document, message)
  values (
    target_org, target_category, target_division, trim(target_first_name), trim(target_last_name), lower(trim(target_email)),
    nullif(trim(coalesce(target_phone, '')), ''), nullif(trim(coalesce(target_document, '')), ''), nullif(trim(coalesce(target_message, '')), '')
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid) from public;
grant execute on function public.submit_club_membership_request(uuid, uuid, text, text, text, text, text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
