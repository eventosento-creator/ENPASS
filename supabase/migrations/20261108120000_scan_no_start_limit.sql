-- Escaneo: la validez de una entrada ya no tiene hora de inicio. Se puede escanear desde que se abre la puerta y solo se rechaza
-- después del cierre (valid_until, que incluye la hora límite de ingreso del evento). Todo lo demás (evento, puerta, entradas usadas,
-- cancelaciones) se valida igual que antes. El resultado 'too_early' sigue existiendo en el tipo pero esta función ya no lo devuelve.
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
  scanned_at timestamptz,
  is_courtesy boolean
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
  is_courtesy_value boolean := false;
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
      is_courtesy_value := public.is_courtesy_ticket(ticket_row.id);
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
      ticket_row.valid_from, ticket_row.valid_until, suggested_gate_value, prior_checkin.scanned_at,
      is_courtesy_value;
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
        null::text, effective_now, null::boolean;
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
    is_courtesy_value := public.is_courtesy_ticket(ticket_row.id);
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
    suggested_gate_value, effective_now, is_courtesy_value;
end;
$$;
