create function public.get_access_credential_name(target_ticket uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(tt.name, et.name)
  from public.tickets t
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.event_tables et on et.id = t.event_table_id
  where t.id = target_ticket;
$$;

create function public.access_credential_allows_gate(target_ticket uuid, target_gate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when t.ticket_type_id is not null then exists (
        select 1 from public.access_gate_ticket_types rule
        where rule.access_gate_id = target_gate and rule.ticket_type_id = t.ticket_type_id
      )
      when t.event_table_id is not null then coalesce(et.access_gate_id = target_gate, true)
      else false
    end,
    false
  )
  from public.tickets t
  left join public.event_tables et on et.id = t.event_table_id
  where t.id = target_ticket;
$$;

create function public.get_access_credential_suggested_gate(target_ticket uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t.ticket_type_id is not null then (
      select g.name
      from public.access_gate_ticket_types rule
      join public.access_gates g on g.id = rule.access_gate_id
      where rule.ticket_type_id = t.ticket_type_id and rule.event_id = t.event_id and g.active
      order by g.name limit 1
    )
    when t.event_table_id is not null then (
      select g.name
      from public.event_tables et join public.access_gates g on g.id = et.access_gate_id
      where et.id = t.event_table_id and g.active
    )
    else null
  end
  from public.tickets t where t.id = target_ticket;
$$;

create or replace function public.check_in_ticket(
  target_session_hash text,
  target_qr_hash text,
  target_idempotency_key uuid
)
returns table (
  result public.checkin_result,
  checkin_id uuid,
  ticket_id uuid,
  holder_name text,
  ticket_type_name text,
  sector text,
  short_code text,
  used_entries integer,
  max_entries integer,
  first_used_at timestamptz,
  first_used_gate_name text,
  valid_from timestamptz,
  valid_until timestamptz,
  suggested_gate_name text,
  scanned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_now timestamptz := clock_timestamp();
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  event_row public.events;
  gate_row public.access_gates;
  ticket_row public.tickets;
  prior_checkin public.checkins;
  outcome public.checkin_result := 'device_not_authorized'::public.checkin_result;
  created_checkin_id uuid;
  entry_number_value integer;
  ticket_type_name_value text;
  holder_name_value text;
  first_used_value timestamptz;
  first_used_gate_value text;
  suggested_gate_value text;
  session_is_valid boolean := false;
  ticket_is_found boolean := false;
begin
  if target_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = 'P0001';
  end if;
  select c.* into prior_checkin
  from public.checkins c
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  where c.idempotency_key = target_idempotency_key
    and (s.session_token_hash = target_session_hash or c.scanner_session_id is null)
  limit 1;
  if found then
    if prior_checkin.ticket_id is not null then
      select * into ticket_row from public.tickets where id = prior_checkin.ticket_id;
      ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
      holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
      select c.scanned_at, g.name into first_used_value, first_used_gate_value
      from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
      where c.ticket_id = ticket_row.id and c.result = 'valid'
      order by c.scanned_at limit 1;
      if prior_checkin.result = 'wrong_gate' then
        suggested_gate_value := public.get_access_credential_suggested_gate(ticket_row.id);
      end if;
    end if;
    return query select prior_checkin.result, prior_checkin.id, prior_checkin.ticket_id,
      case when prior_checkin.result in ('valid', 'already_used') then holder_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
      case when prior_checkin.result not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
      case when prior_checkin.result in ('valid', 'already_used') then ticket_row.short_code else null end,
      ticket_row.used_entries, ticket_row.max_entries, first_used_value, first_used_gate_value,
      ticket_row.valid_from, ticket_row.valid_until, suggested_gate_value, prior_checkin.scanned_at;
    return;
  end if;

  if target_session_hash ~ '^[0-9a-f]{64}$' then
    select * into session_row from public.scanner_sessions
    where session_token_hash = target_session_hash for update;
    if found then
      select * into authorization_row from public.scanner_device_authorizations
      where id = session_row.authorization_id for update;
      select * into event_row from public.events where id = session_row.event_id;
      select * into gate_row from public.access_gates where id = session_row.access_gate_id;
      session_is_valid := authorization_row.id is not null
        and session_row.revoked_at is null and session_row.expires_at > effective_now
        and authorization_row.revoked_at is null
        and event_row.status in ('published', 'sold_out') and gate_row.active;
    end if;
  end if;
  if not session_is_valid then
    outcome := 'device_not_authorized';
  else
    update public.scanner_sessions
    set last_seen_at = effective_now,
        scan_window_started_at = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then effective_now
          else scan_window_started_at end,
        scan_attempts = case
          when scan_window_started_at <= effective_now - interval '10 seconds' then 1
          else scan_attempts + 1 end
    where id = session_row.id returning * into session_row;
    if session_row.scan_attempts > 60 then
      return query select 'rate_limited'::public.checkin_result, null::uuid, null::uuid,
        null::text, null::text, null::text, null::text, null::integer, null::integer,
        null::timestamptz, null::text, null::timestamptz, null::timestamptz,
        null::text, effective_now;
      return;
    end if;
    if target_qr_hash !~ '^[0-9a-f]{64}$' then
      outcome := 'invalid';
    else
      select * into ticket_row from public.tickets where qr_token_hash = target_qr_hash for update;
      ticket_is_found := found;
      if not ticket_is_found then outcome := 'invalid';
      elsif ticket_row.organization_id <> session_row.organization_id
        or ticket_row.event_id <> session_row.event_id then outcome := 'wrong_event';
      elsif ticket_row.status = 'cancelled' then outcome := 'cancelled';
      elsif ticket_row.status = 'refunded' then outcome := 'refunded';
      elsif effective_now < ticket_row.valid_from then outcome := 'too_early';
      elsif effective_now > ticket_row.valid_until then outcome := 'too_late';
      elsif not public.access_credential_allows_gate(ticket_row.id, session_row.access_gate_id) then
        outcome := 'wrong_gate';
        suggested_gate_value := public.get_access_credential_suggested_gate(ticket_row.id);
      elsif ticket_row.used_entries >= ticket_row.max_entries then
        outcome := 'already_used';
        select c.scanned_at, g.name into first_used_value, first_used_gate_value
        from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
        where c.ticket_id = ticket_row.id and c.result = 'valid'
        order by c.scanned_at limit 1;
      else
        outcome := 'valid';
        entry_number_value := ticket_row.used_entries + 1;
        update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
        ticket_row.used_entries := entry_number_value;
      end if;
    end if;
  end if;
  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, scanned_at
  ) values (
    case when session_row.id is not null then session_row.organization_id else null end,
    case when session_row.id is not null then session_row.event_id else null end,
    case when ticket_is_found then ticket_row.id else null end,
    case when session_row.id is not null then session_row.access_gate_id else null end,
    case when session_row.id is not null then session_row.id else null end,
    outcome, 'qr', entry_number_value, target_idempotency_key, effective_now
  ) returning id into created_checkin_id;
  if ticket_is_found and ticket_row.event_id = session_row.event_id then
    ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
    holder_name_value := trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.');
  end if;
  if outcome = 'valid' and entry_number_value > 1 then
    select c.scanned_at, g.name into first_used_value, first_used_gate_value
    from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
    where c.ticket_id = ticket_row.id and c.result = 'valid'
    order by c.scanned_at limit 1;
  end if;
  return query select outcome, created_checkin_id,
    case when ticket_is_found then ticket_row.id else null end,
    case when outcome in ('valid', 'already_used') then holder_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_type_name_value else null end,
    case when outcome not in ('invalid', 'device_not_authorized', 'wrong_event') then ticket_row.sector else null end,
    case when outcome in ('valid', 'already_used') then ticket_row.short_code else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.used_entries else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.max_entries else null end,
    first_used_value, first_used_gate_value,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_from else null end,
    case when ticket_is_found and ticket_row.event_id = session_row.event_id then ticket_row.valid_until else null end,
    suggested_gate_value, effective_now;
end;
$$;

create or replace function public.supervisor_override_checkin(
  target_session_hash text,
  target_checkin uuid,
  target_reason public.checkin_override_reason,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  gate_row public.access_gates;
  event_row public.events;
  prior_checkin public.checkins;
  existing_override public.checkins;
  ticket_row public.tickets;
  ticket_type_name_value text;
  created_checkin_id uuid;
  entry_number_value integer;
  effective_now timestamptz := clock_timestamp();
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' or target_idempotency_key is null then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id for update;
  select * into gate_row from public.access_gates where id = session_row.access_gate_id;
  select * into event_row from public.events where id = session_row.event_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null or session_row.expires_at <= effective_now
    or authorization_row.revoked_at is not null or not gate_row.active
    or event_row.status not in ('published', 'sold_out') then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  select * into existing_override from public.checkins
  where idempotency_key = target_idempotency_key and scanner_session_id = session_row.id;
  if found then
    return jsonb_build_object('result', existing_override.result, 'checkin_id', existing_override.id);
  end if;
  select * into prior_checkin from public.checkins where id = target_checkin for update;
  if not found or prior_checkin.event_id <> session_row.event_id
    or prior_checkin.ticket_id is null
    or prior_checkin.result not in ('wrong_gate', 'too_early', 'too_late')
    or target_reason not in ('wrong_gate', 'outside_window', 'supervisor_exception') then
    raise exception 'OVERRIDE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into existing_override from public.checkins where override_of_checkin_id = prior_checkin.id;
  if found then
    return jsonb_build_object('result', existing_override.result, 'checkin_id', existing_override.id);
  end if;
  select * into ticket_row from public.tickets where id = prior_checkin.ticket_id for update;
  if ticket_row.status <> 'valid' or ticket_row.used_entries >= ticket_row.max_entries then
    raise exception 'OVERRIDE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  entry_number_value := ticket_row.used_entries + 1;
  update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
  ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, override,
    override_by_scanner_session_id, override_of_checkin_id, override_reason, scanned_at
  ) values (
    session_row.organization_id, session_row.event_id, ticket_row.id,
    session_row.access_gate_id, session_row.id, 'valid', 'qr', entry_number_value,
    target_idempotency_key, true, session_row.id, prior_checkin.id, target_reason, effective_now
  ) returning id into created_checkin_id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, after_data)
  values (
    session_row.organization_id, 'access.checkin.override', 'checkin', created_checkin_id,
    jsonb_build_object(
      'original_checkin_id', prior_checkin.id, 'scanner_session_id', session_row.id,
      'reason', target_reason, 'entry_number', entry_number_value
    )
  );
  return jsonb_build_object(
    'result', 'valid', 'checkin_id', created_checkin_id, 'ticket_id', ticket_row.id,
    'holder_name', trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.'),
    'ticket_type_name', ticket_type_name_value, 'sector', ticket_row.sector,
    'short_code', ticket_row.short_code, 'used_entries', entry_number_value,
    'max_entries', ticket_row.max_entries, 'scanned_at', effective_now, 'override', true
  );
end;
$$;

create or replace function public.get_supervisor_ticket_preview(
  target_session_hash text,
  target_short_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  ticket_row public.tickets;
  ticket_type_name_value text;
begin
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null or session_row.expires_at <= now()
    or authorization_row.revoked_at is not null then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions
  set manual_window_started_at = case
        when manual_window_started_at <= now() - interval '1 minute' then now()
        else manual_window_started_at end,
      manual_attempts = case
        when manual_window_started_at <= now() - interval '1 minute' then 1
        else manual_attempts + 1 end,
      last_seen_at = now()
  where id = session_row.id returning * into session_row;
  if session_row.manual_attempts > 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  if upper(trim(target_short_code)) !~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$' then
    return jsonb_build_object('found', false);
  end if;
  select * into ticket_row from public.tickets
  where short_code = upper(trim(target_short_code)) and event_id = session_row.event_id;
  if not found then return jsonb_build_object('found', false); end if;
  ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
  return jsonb_build_object(
    'found', true, 'short_code', ticket_row.short_code,
    'holder_name', trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.'),
    'ticket_type_name', ticket_type_name_value, 'sector', ticket_row.sector,
    'status', ticket_row.status, 'used_entries', ticket_row.used_entries,
    'max_entries', ticket_row.max_entries, 'valid_from', ticket_row.valid_from,
    'valid_until', ticket_row.valid_until
  );
end;
$$;

create or replace function public.supervisor_manual_checkin(
  target_session_hash text,
  target_short_code text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_now timestamptz := clock_timestamp();
  session_row public.scanner_sessions;
  authorization_row public.scanner_device_authorizations;
  gate_row public.access_gates;
  event_row public.events;
  ticket_row public.tickets;
  prior_checkin public.checkins;
  outcome public.checkin_result := 'invalid'::public.checkin_result;
  created_checkin_id uuid;
  entry_number_value integer;
  ticket_type_name_value text;
  suggested_gate_value text;
  first_used_value timestamptz;
  first_used_gate_value text;
begin
  select * into session_row from public.scanner_sessions
  where session_token_hash = target_session_hash for update;
  if not found then raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001'; end if;
  select * into authorization_row from public.scanner_device_authorizations
  where id = session_row.authorization_id for update;
  select * into gate_row from public.access_gates where id = session_row.access_gate_id;
  select * into event_row from public.events where id = session_row.event_id;
  if session_row.permission <> 'supervisor'
    or session_row.revoked_at is not null or session_row.expires_at <= effective_now
    or authorization_row.revoked_at is not null or not gate_row.active
    or event_row.status not in ('published', 'sold_out') then
    raise exception 'SUPERVISOR_REQUIRED' using errcode = 'P0001';
  end if;
  update public.scanner_sessions
  set manual_window_started_at = case
        when manual_window_started_at <= effective_now - interval '1 minute' then effective_now
        else manual_window_started_at end,
      manual_attempts = case
        when manual_window_started_at <= effective_now - interval '1 minute' then 1
        else manual_attempts + 1 end,
      last_seen_at = effective_now
  where id = session_row.id returning * into session_row;
  if session_row.manual_attempts > 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  select * into prior_checkin from public.checkins
  where idempotency_key = target_idempotency_key and scanner_session_id = session_row.id;
  if found then
    return jsonb_build_object('result', prior_checkin.result, 'checkin_id', prior_checkin.id);
  end if;
  if upper(trim(target_short_code)) ~ '^N[A-Z0-9]{3}-[A-Z0-9]{2}$' then
    select * into ticket_row from public.tickets
    where short_code = upper(trim(target_short_code)) and event_id = session_row.event_id for update;
  end if;
  if ticket_row.id is null then outcome := 'invalid';
  elsif ticket_row.status = 'cancelled' then outcome := 'cancelled';
  elsif ticket_row.status = 'refunded' then outcome := 'refunded';
  elsif effective_now < ticket_row.valid_from then outcome := 'too_early';
  elsif effective_now > ticket_row.valid_until then outcome := 'too_late';
  elsif not public.access_credential_allows_gate(ticket_row.id, session_row.access_gate_id) then
    outcome := 'wrong_gate';
    suggested_gate_value := public.get_access_credential_suggested_gate(ticket_row.id);
  elsif ticket_row.used_entries >= ticket_row.max_entries then
    outcome := 'already_used';
    select c.scanned_at, g.name into first_used_value, first_used_gate_value
    from public.checkins c left join public.access_gates g on g.id = c.access_gate_id
    where c.ticket_id = ticket_row.id and c.result = 'valid'
    order by c.scanned_at limit 1;
  else
    outcome := 'valid';
    entry_number_value := ticket_row.used_entries + 1;
    update public.tickets set used_entries = entry_number_value where id = ticket_row.id;
    ticket_row.used_entries := entry_number_value;
  end if;
  insert into public.checkins (
    organization_id, event_id, ticket_id, access_gate_id, scanner_session_id,
    result, source, entry_number, idempotency_key, override,
    override_by_scanner_session_id, override_reason, scanned_at
  ) values (
    session_row.organization_id, session_row.event_id, ticket_row.id,
    session_row.access_gate_id, session_row.id, outcome, 'manual', entry_number_value,
    target_idempotency_key, true, session_row.id, 'manual_code', effective_now
  ) returning id into created_checkin_id;
  if ticket_row.id is not null then
    ticket_type_name_value := public.get_access_credential_name(ticket_row.id);
  end if;
  return jsonb_build_object(
    'result', outcome, 'checkin_id', created_checkin_id, 'ticket_id', ticket_row.id,
    'holder_name', case when outcome in ('valid', 'already_used') then trim(ticket_row.holder_first_name || ' ' || left(ticket_row.holder_last_name, 1) || '.') else null end,
    'ticket_type_name', case when ticket_row.id is not null then ticket_type_name_value else null end,
    'sector', ticket_row.sector,
    'short_code', case when outcome in ('valid', 'already_used') then ticket_row.short_code else null end,
    'used_entries', ticket_row.used_entries, 'max_entries', ticket_row.max_entries,
    'first_used_at', first_used_value, 'first_used_gate_name', first_used_gate_value,
    'valid_from', ticket_row.valid_from, 'valid_until', ticket_row.valid_until,
    'suggested_gate_name', suggested_gate_value, 'scanned_at', effective_now, 'override', true
  );
end;
$$;

create or replace function public.get_event_recent_checkins(target_event uuid, result_limit integer default 30)
returns table (
  checkin_id uuid,
  result public.checkin_result,
  gate_name text,
  device_label text,
  ticket_type_name text,
  holder_name text,
  short_code text,
  entry_number integer,
  override boolean,
  source public.checkin_source,
  scanned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target_organization uuid;
begin
  select e.organization_id into target_organization from public.events e where e.id = target_event;
  if target_organization is null or auth.uid() is null or not public.can_manage_org(target_organization) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select c.id, c.result, g.name, a.label,
    coalesce(tt.name, et.name),
    case when t.id is null then null else trim(t.holder_first_name || ' ' || left(t.holder_last_name, 1) || '.') end,
    t.short_code, c.entry_number, c.override, c.source, c.scanned_at
  from public.checkins c
  left join public.access_gates g on g.id = c.access_gate_id
  left join public.scanner_sessions s on s.id = c.scanner_session_id
  left join public.scanner_device_authorizations a on a.id = s.authorization_id
  left join public.tickets t on t.id = c.ticket_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.event_tables et on et.id = t.event_table_id
  where c.event_id = target_event
  order by c.scanned_at desc
  limit least(greatest(coalesce(result_limit, 30), 1), 100);
end;
$$;

revoke all on function public.get_access_credential_name(uuid) from public, anon, authenticated;
revoke all on function public.access_credential_allows_gate(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_access_credential_suggested_gate(uuid) from public, anon, authenticated;
revoke all on function public.check_in_ticket(text, text, uuid) from public, anon, authenticated;
revoke all on function public.supervisor_override_checkin(text, uuid, public.checkin_override_reason, uuid) from public, anon, authenticated;
revoke all on function public.get_supervisor_ticket_preview(text, text) from public, anon, authenticated;
revoke all on function public.supervisor_manual_checkin(text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_event_recent_checkins(uuid, integer) from public, anon, authenticated;

grant execute on function public.check_in_ticket(text, text, uuid) to service_role;
grant execute on function public.supervisor_override_checkin(text, uuid, public.checkin_override_reason, uuid) to service_role;
grant execute on function public.get_supervisor_ticket_preview(text, text) to service_role;
grant execute on function public.supervisor_manual_checkin(text, text, uuid) to service_role;
grant execute on function public.get_event_recent_checkins(uuid, integer) to authenticated;
