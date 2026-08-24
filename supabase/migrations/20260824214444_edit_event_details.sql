create function public.update_event_details(
  target_event uuid,
  target_venue uuid,
  target_name text,
  target_description text,
  target_starts_at timestamptz,
  target_doors_open_at timestamptz,
  target_ends_at timestamptz,
  target_capacity integer,
  target_require_document boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  venue_row public.venues;
  configured_capacity bigint;
begin
  select * into event_row
  from public.events
  where id = target_event
  for update;

  if not found or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if event_row.status in ('finished', 'cancelled') then
    raise exception 'EVENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  select * into venue_row
  from public.venues
  where id = target_venue and organization_id = event_row.organization_id;

  if not found then
    raise exception 'VENUE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if char_length(trim(target_name)) not between 2 and 140
    or char_length(trim(coalesce(target_description, ''))) > 4000
    or target_starts_at is null
    or target_starts_at <= now()
    or target_capacity is null
    or target_capacity <= 0 then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;

  if target_doors_open_at is not null and target_doors_open_at > target_starts_at then
    raise exception 'DOORS_AFTER_START' using errcode = 'P0001';
  end if;

  if target_ends_at is not null and target_ends_at <= target_starts_at then
    raise exception 'END_BEFORE_START' using errcode = 'P0001';
  end if;

  if target_capacity > venue_row.capacity then
    raise exception 'VENUE_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  select
    coalesce((select sum(t.quantity) from public.ticket_types t where t.event_id = event_row.id and t.active), 0)
    + coalesce((select sum(et.capacity) from public.event_tables et where et.event_id = event_row.id and et.active), 0)
  into configured_capacity;

  if configured_capacity > target_capacity then
    raise exception 'CONFIGURED_CAPACITY_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.events
  set venue_id = venue_row.id,
      name = trim(target_name),
      description = trim(coalesce(target_description, '')),
      starts_at = target_starts_at,
      doors_open_at = target_doors_open_at,
      ends_at = target_ends_at,
      capacity = target_capacity,
      require_document = target_require_document
  where id = event_row.id;

  update public.tickets
  set valid_from = coalesce(target_doors_open_at, target_starts_at),
      valid_until = coalesce(target_ends_at, target_starts_at + interval '16 hours')
  where event_id = event_row.id
    and status = 'valid';

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    event_row.organization_id,
    auth.uid(),
    'event.updated',
    'event',
    event_row.id,
    jsonb_build_object(
      'venue_id', event_row.venue_id,
      'name', event_row.name,
      'starts_at', event_row.starts_at,
      'doors_open_at', event_row.doors_open_at,
      'ends_at', event_row.ends_at,
      'capacity', event_row.capacity,
      'require_document', event_row.require_document
    ),
    jsonb_build_object(
      'venue_id', venue_row.id,
      'name', trim(target_name),
      'starts_at', target_starts_at,
      'doors_open_at', target_doors_open_at,
      'ends_at', target_ends_at,
      'capacity', target_capacity,
      'require_document', target_require_document
    )
  );
end;
$$;

revoke all on function public.update_event_details(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, integer, boolean)
from public, anon, authenticated;

grant execute on function public.update_event_details(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, integer, boolean)
to authenticated;
