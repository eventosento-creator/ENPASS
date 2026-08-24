create type public.promoter_status as enum ('active', 'inactive');
create type public.event_promoter_status as enum ('active', 'inactive');
create type public.promoter_commission_type as enum ('fixed_per_ticket', 'percentage');
create type public.promoter_commission_status as enum ('pending', 'confirmed', 'cancelled', 'refunded', 'paid_out');

create table public.promoters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 140),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text check (last_name is null or char_length(last_name) <= 80),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 40),
  instagram text check (instagram is null or char_length(instagram) <= 80),
  status public.promoter_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index promoters_organization_email_unique
  on public.promoters (organization_id, lower(email))
  where email is not null;
create index promoters_organization_status_idx
  on public.promoters (organization_id, status, display_name);

create table public.event_promoters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  promoter_id uuid not null references public.promoters(id) on delete restrict,
  public_slug text not null check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.event_promoter_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, promoter_id),
  unique (event_id, public_slug)
);

create index event_promoters_organization_event_idx
  on public.event_promoters (organization_id, event_id, status);
create index event_promoters_promoter_idx
  on public.event_promoters (promoter_id, event_id);

create table public.promoter_commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_promoter_id uuid not null references public.event_promoters(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete cascade,
  commission_type public.promoter_commission_type not null,
  commission_value bigint not null,
  currency char(3) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (commission_type = 'fixed_per_ticket' and commission_value > 0)
    or (commission_type = 'percentage' and commission_value between 1 and 10000)
  )
);

create unique index promoter_commission_rules_general_active_unique
  on public.promoter_commission_rules (event_promoter_id)
  where ticket_type_id is null and active;
create unique index promoter_commission_rules_ticket_active_unique
  on public.promoter_commission_rules (event_promoter_id, ticket_type_id)
  where ticket_type_id is not null and active;
create index promoter_commission_rules_event_promoter_idx
  on public.promoter_commission_rules (event_id, event_promoter_id, active);
create index promoter_commission_rules_ticket_type_idx
  on public.promoter_commission_rules (ticket_type_id)
  where ticket_type_id is not null;

alter table public.orders
  add column promoter_id uuid references public.promoters(id) on delete restrict,
  add column event_promoter_id uuid references public.event_promoters(id) on delete restrict,
  add constraint orders_promoter_attribution_pair
    check ((promoter_id is null) = (event_promoter_id is null));

create index orders_event_promoter_status_created_idx
  on public.orders (event_promoter_id, status, created_at desc)
  where event_promoter_id is not null;
create index orders_promoter_status_created_idx
  on public.orders (promoter_id, status, created_at desc)
  where promoter_id is not null;

create table public.promoter_commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  promoter_id uuid not null references public.promoters(id) on delete restrict,
  event_promoter_id uuid not null references public.event_promoters(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  ticket_id uuid references public.tickets(id) on delete set null,
  commission_rule_id uuid references public.promoter_commission_rules(id) on delete set null,
  commission_type public.promoter_commission_type not null,
  commission_value bigint not null,
  base_amount bigint not null check (base_amount >= 0),
  quantity integer not null check (quantity > 0),
  commission_amount bigint not null check (commission_amount >= 0),
  currency char(3) not null,
  status public.promoter_commission_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  paid_out_at timestamptz,
  unique (order_item_id)
);

create index promoter_commissions_event_promoter_status_idx
  on public.promoter_commissions (event_id, event_promoter_id, status);
create index promoter_commissions_promoter_status_created_idx
  on public.promoter_commissions (promoter_id, status, created_at desc);
create index promoter_commissions_order_idx on public.promoter_commissions (order_id);
create index promoter_commissions_rule_idx on public.promoter_commissions (commission_rule_id)
  where commission_rule_id is not null;

create table public.promoter_attribution_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash char(64) not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  anonymous_session_id uuid not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index promoter_attribution_sessions_expiry_idx
  on public.promoter_attribution_sessions (expires_at);

create table public.promoter_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attribution_session_id uuid not null references public.promoter_attribution_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_promoter_id uuid not null references public.event_promoters(id) on delete cascade,
  touched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (attribution_session_id, event_id)
);

create index promoter_attributions_event_session_idx
  on public.promoter_attributions (event_id, attribution_session_id, expires_at);
create index promoter_attributions_event_promoter_idx
  on public.promoter_attributions (event_promoter_id, touched_at desc);

create table public.promoter_link_visits (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_promoter_id uuid not null references public.event_promoters(id) on delete cascade,
  anonymous_session_id uuid not null,
  visited_at timestamptz not null default now()
);

create index promoter_link_visits_event_promoter_visited_idx
  on public.promoter_link_visits (event_promoter_id, visited_at desc);
create index promoter_link_visits_dedup_idx
  on public.promoter_link_visits (event_promoter_id, anonymous_session_id, visited_at desc);

create table public.promoter_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  event_promoter_id uuid not null references public.event_promoters(id) on delete cascade,
  token_hash char(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  exchanged_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index promoter_access_tokens_promoter_expiry_idx
  on public.promoter_access_tokens (promoter_id, expires_at desc)
  where exchanged_at is null and revoked_at is null;

create table public.promoter_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  session_hash char(64) not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index promoter_sessions_promoter_active_idx
  on public.promoter_sessions (promoter_id, expires_at desc)
  where revoked_at is null;
create index promoter_sessions_expiry_idx
  on public.promoter_sessions (expires_at)
  where revoked_at is null;

create trigger promoters_touch before update on public.promoters
for each row execute function public.touch_updated_at();
create trigger event_promoters_touch before update on public.event_promoters
for each row execute function public.touch_updated_at();
create trigger promoter_commission_rules_touch before update on public.promoter_commission_rules
for each row execute function public.touch_updated_at();

alter table public.promoters enable row level security;
alter table public.event_promoters enable row level security;
alter table public.promoter_commission_rules enable row level security;
alter table public.promoter_commissions enable row level security;
alter table public.promoter_attribution_sessions enable row level security;
alter table public.promoter_attributions enable row level security;
alter table public.promoter_link_visits enable row level security;
alter table public.promoter_access_tokens enable row level security;
alter table public.promoter_sessions enable row level security;

create policy promoters_manager_select on public.promoters
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy event_promoters_manager_select on public.event_promoters
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy promoter_commission_rules_manager_select on public.promoter_commission_rules
for select to authenticated
using ((select public.can_manage_org(organization_id)));

create policy promoter_commissions_manager_select on public.promoter_commissions
for select to authenticated
using ((select public.can_manage_org(organization_id)));

revoke all on table public.promoters, public.event_promoters,
  public.promoter_commission_rules, public.promoter_commissions,
  public.promoter_attribution_sessions, public.promoter_attributions,
  public.promoter_link_visits, public.promoter_access_tokens,
  public.promoter_sessions from anon, authenticated;

grant select on table public.promoters, public.event_promoters,
  public.promoter_commission_rules, public.promoter_commissions to authenticated;

grant all on table public.promoters, public.event_promoters,
  public.promoter_commission_rules, public.promoter_commissions,
  public.promoter_attribution_sessions, public.promoter_attributions,
  public.promoter_link_visits, public.promoter_access_tokens,
  public.promoter_sessions to service_role;
grant usage, select on sequence public.promoter_link_visits_id_seq to service_role;

create function public.create_event_promoter(
  target_event uuid,
  promoter_first_name text,
  promoter_last_name text,
  promoter_email text,
  promoter_phone text,
  promoter_instagram text,
  target_public_slug text,
  target_commission_type public.promoter_commission_type,
  target_commission_value bigint
)
returns table (event_promoter_id uuid, promoter_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  existing_promoter public.promoters;
  normalized_email text := nullif(lower(trim(promoter_email)), '');
  normalized_last_name text := nullif(trim(promoter_last_name), '');
  normalized_phone text := nullif(trim(promoter_phone), '');
  normalized_instagram text := nullif(regexp_replace(trim(promoter_instagram), '^@', ''), '');
  normalized_first_name text := trim(promoter_first_name);
  normalized_slug text := lower(trim(target_public_slug));
  new_event_promoter_id uuid;
  was_created boolean := false;
begin
  select * into event_row from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(normalized_first_name) < 1 or char_length(normalized_first_name) > 80
    or (normalized_last_name is not null and char_length(normalized_last_name) > 80)
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or (normalized_email is not null and normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'INVALID_PROMOTER' using errcode = 'P0001';
  end if;

  if normalized_email is not null then
    select * into existing_promoter
    from public.promoters p
    where p.organization_id = event_row.organization_id
      and lower(p.email) = normalized_email
    for update;
  end if;

  if existing_promoter.id is null then
    insert into public.promoters (
      organization_id, display_name, first_name, last_name, email, phone, instagram
    ) values (
      event_row.organization_id,
      concat_ws(' ', normalized_first_name, normalized_last_name),
      normalized_first_name, normalized_last_name, normalized_email,
      normalized_phone, normalized_instagram
    ) returning * into existing_promoter;
    was_created := true;
  elsif existing_promoter.status <> 'active' then
    raise exception 'PROMOTER_INACTIVE' using errcode = 'P0001';
  else
    update public.promoters
    set first_name = normalized_first_name,
        last_name = normalized_last_name,
        display_name = concat_ws(' ', normalized_first_name, normalized_last_name),
        phone = coalesce(normalized_phone, phone),
        instagram = coalesce(normalized_instagram, instagram)
    where id = existing_promoter.id
    returning * into existing_promoter;
  end if;

  insert into public.event_promoters (
    organization_id, event_id, promoter_id, public_slug
  ) values (
    event_row.organization_id, event_row.id, existing_promoter.id, normalized_slug
  ) returning id into new_event_promoter_id;

  insert into public.promoter_commission_rules (
    organization_id, event_id, event_promoter_id, ticket_type_id,
    commission_type, commission_value, currency
  ) values (
    event_row.organization_id, event_row.id, new_event_promoter_id, null,
    target_commission_type, target_commission_value, event_row.currency
  );

  if was_created then
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, after_data
    ) values (
      event_row.organization_id, auth.uid(), 'promoter.created', 'promoter', existing_promoter.id,
      jsonb_build_object('display_name', existing_promoter.display_name)
    );
  end if;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values
    (
      event_row.organization_id, auth.uid(), 'event_promoter.created', 'event_promoter', new_event_promoter_id,
      jsonb_build_object('event_id', event_row.id, 'public_slug', normalized_slug)
    ),
    (
      event_row.organization_id, auth.uid(), 'commission_rule.created', 'event_promoter', new_event_promoter_id,
      jsonb_build_object('commission_type', target_commission_type, 'commission_value', target_commission_value)
    );

  return query select new_event_promoter_id, existing_promoter.id;
end;
$$;

create function public.update_event_promoter(
  target_event_promoter uuid,
  promoter_first_name text,
  promoter_last_name text,
  promoter_email text,
  promoter_phone text,
  promoter_instagram text,
  target_public_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_promoter_row public.event_promoters;
  normalized_first_name text := trim(promoter_first_name);
  normalized_last_name text := nullif(trim(promoter_last_name), '');
  normalized_email text := nullif(lower(trim(promoter_email)), '');
  normalized_slug text := lower(trim(target_public_slug));
begin
  select * into event_promoter_row
  from public.event_promoters where id = target_event_promoter for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_promoter_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(normalized_first_name) < 1 or char_length(normalized_first_name) > 80
    or (normalized_last_name is not null and char_length(normalized_last_name) > 80)
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or (normalized_email is not null and normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'INVALID_PROMOTER' using errcode = 'P0001';
  end if;

  update public.promoters
  set first_name = normalized_first_name,
      last_name = normalized_last_name,
      display_name = concat_ws(' ', normalized_first_name, normalized_last_name),
      email = normalized_email,
      phone = nullif(trim(promoter_phone), ''),
      instagram = nullif(regexp_replace(trim(promoter_instagram), '^@', ''), '')
  where id = event_promoter_row.promoter_id;

  update public.event_promoters
  set public_slug = normalized_slug
  where id = event_promoter_row.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_promoter_row.organization_id, auth.uid(), 'promoter.updated', 'promoter', event_promoter_row.promoter_id,
    jsonb_build_object('event_promoter_id', event_promoter_row.id, 'public_slug', normalized_slug)
  );
end;
$$;

create function public.set_event_promoter_status(
  target_event_promoter uuid,
  target_status public.event_promoter_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare event_promoter_row public.event_promoters;
begin
  select * into event_promoter_row
  from public.event_promoters where id = target_event_promoter for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_promoter_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  update public.event_promoters set status = target_status where id = target_event_promoter;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_promoter_row.organization_id, auth.uid(),
    case when target_status = 'inactive' then 'event_promoter.disabled' else 'event_promoter.enabled' end,
    'event_promoter', event_promoter_row.id,
    jsonb_build_object('status', target_status)
  );
end;
$$;

create function public.upsert_promoter_commission_rule(
  target_event_promoter uuid,
  target_ticket_type uuid,
  target_commission_type public.promoter_commission_type,
  target_commission_value bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_promoter_row public.event_promoters;
  event_row public.events;
  existing_rule public.promoter_commission_rules;
  resulting_rule_id uuid;
begin
  select * into event_promoter_row
  from public.event_promoters where id = target_event_promoter for update;
  if not found or auth.uid() is null or not public.can_manage_org(event_promoter_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select * into event_row from public.events where id = event_promoter_row.event_id;
  if target_ticket_type is not null and not exists (
    select 1 from public.ticket_types t
    where t.id = target_ticket_type and t.event_id = event_promoter_row.event_id
  ) then
    raise exception 'INVALID_TICKET_TYPE' using errcode = 'P0001';
  end if;

  select * into existing_rule
  from public.promoter_commission_rules r
  where r.event_promoter_id = target_event_promoter
    and r.ticket_type_id is not distinct from target_ticket_type
    and r.active
  for update;

  if existing_rule.id is null then
    insert into public.promoter_commission_rules (
      organization_id, event_id, event_promoter_id, ticket_type_id,
      commission_type, commission_value, currency
    ) values (
      event_promoter_row.organization_id, event_promoter_row.event_id,
      event_promoter_row.id, target_ticket_type,
      target_commission_type, target_commission_value, event_row.currency
    ) returning id into resulting_rule_id;
  else
    update public.promoter_commission_rules
    set commission_type = target_commission_type,
        commission_value = target_commission_value,
        currency = event_row.currency
    where id = existing_rule.id
    returning id into resulting_rule_id;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    event_promoter_row.organization_id, auth.uid(),
    case when existing_rule.id is null then 'commission_rule.created' else 'commission_rule.updated' end,
    'commission_rule', resulting_rule_id,
    case when existing_rule.id is null then null else jsonb_build_object(
      'commission_type', existing_rule.commission_type,
      'commission_value', existing_rule.commission_value
    ) end,
    jsonb_build_object(
      'ticket_type_id', target_ticket_type,
      'commission_type', target_commission_type,
      'commission_value', target_commission_value
    )
  );
  return resulting_rule_id;
end;
$$;

create function public.create_promoter_access_token(
  target_event_promoter uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_promoter_row public.event_promoters;
  access_token_id uuid;
begin
  select * into event_promoter_row
  from public.event_promoters where id = target_event_promoter;
  if not found or auth.uid() is null or not public.can_manage_org(event_promoter_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if target_token_hash !~ '^[0-9a-f]{64}$'
    or target_expires_at <= now()
    or target_expires_at > now() + interval '7 days' then
    raise exception 'INVALID_PROMOTER_ACCESS_REQUEST' using errcode = 'P0001';
  end if;

  update public.promoter_access_tokens
  set revoked_at = coalesce(revoked_at, now())
  where promoter_id = event_promoter_row.promoter_id
    and exchanged_at is null and revoked_at is null;

  insert into public.promoter_access_tokens (
    organization_id, promoter_id, event_promoter_id, token_hash, expires_at
  ) values (
    event_promoter_row.organization_id, event_promoter_row.promoter_id,
    event_promoter_row.id, target_token_hash, target_expires_at
  ) returning id into access_token_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    event_promoter_row.organization_id, auth.uid(), 'promoter.invite.created',
    'promoter', event_promoter_row.promoter_id,
    jsonb_build_object('event_promoter_id', event_promoter_row.id, 'expires_at', target_expires_at)
  );
  return access_token_id;
end;
$$;

create function public.exchange_promoter_access_token(
  target_token_hash text,
  target_session_hash text,
  target_session_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare access_token_row public.promoter_access_tokens;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$'
    or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_session_expires_at <= now()
    or target_session_expires_at > now() + interval '31 days' then
    return false;
  end if;

  select * into access_token_row
  from public.promoter_access_tokens t
  where t.token_hash = target_token_hash
  for update;

  if not found
    or access_token_row.expires_at <= now()
    or access_token_row.exchanged_at is not null
    or access_token_row.revoked_at is not null
    or not exists (
      select 1
      from public.promoters p
      join public.event_promoters ep on ep.promoter_id = p.id
      where p.id = access_token_row.promoter_id
        and p.status = 'active'
        and ep.id = access_token_row.event_promoter_id
        and ep.status = 'active'
    ) then
    return false;
  end if;

  update public.promoter_access_tokens
  set exchanged_at = now()
  where id = access_token_row.id;

  insert into public.promoter_sessions (
    organization_id, promoter_id, session_hash, expires_at
  ) values (
    access_token_row.organization_id, access_token_row.promoter_id,
    target_session_hash, target_session_expires_at
  );
  return true;
end;
$$;

create function public.get_promoter_session(target_session_hash text)
returns table (
  promoter_id uuid,
  organization_id uuid,
  display_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;

  update public.promoter_sessions s
  set last_used_at = now()
  from public.promoters p
  where s.session_hash = target_session_hash
    and s.promoter_id = p.id
    and s.revoked_at is null
    and s.expires_at > now()
    and p.status = 'active';

  return query
  select p.id, p.organization_id, p.display_name, s.expires_at
  from public.promoter_sessions s
  join public.promoters p on p.id = s.promoter_id and p.status = 'active'
  where s.session_hash = target_session_hash
    and s.revoked_at is null
    and s.expires_at > now();
end;
$$;

create function public.revoke_promoter_session(target_session_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_session_hash ~ '^[0-9a-f]{64}$' then
    update public.promoter_sessions
    set revoked_at = coalesce(revoked_at, now())
    where session_hash = target_session_hash;
  end if;
end;
$$;

create function public.record_promoter_link_visit(
  target_event_slug text,
  target_promoter_slug text,
  target_session_hash text,
  target_anonymous_session_id uuid
)
returns table (
  resolved_event_id uuid,
  resolved_event_promoter_id uuid,
  promoter_display_name text,
  attribution_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved record;
  resolved_attribution_session_id uuid;
  resolved_anonymous_session_id uuid;
  effective_expiry timestamptz;
begin
  if target_session_hash !~ '^[0-9a-f]{64}$' then return; end if;

  select e.id, e.organization_id, e.starts_at, e.ends_at,
    ep.id as event_promoter_id, p.display_name
  into resolved
  from public.events e
  join public.event_promoters ep on ep.event_id = e.id and ep.status = 'active'
  join public.promoters p on p.id = ep.promoter_id and p.status = 'active'
  where e.slug = target_event_slug
    and e.status = 'published'
    and ep.public_slug = target_promoter_slug;

  if not found then return; end if;

  effective_expiry := least(
    now() + interval '7 days',
    coalesce(resolved.ends_at, resolved.starts_at + interval '1 day')
  );
  if effective_expiry <= now() then return; end if;

  insert into public.promoter_attribution_sessions (
    session_token_hash, anonymous_session_id, expires_at
  ) values (
    target_session_hash, target_anonymous_session_id, now() + interval '7 days'
  )
  on conflict (session_token_hash) do update
  set last_seen_at = now(),
      expires_at = greatest(public.promoter_attribution_sessions.expires_at, excluded.expires_at)
  returning id, anonymous_session_id
  into resolved_attribution_session_id, resolved_anonymous_session_id;

  insert into public.promoter_attributions (
    organization_id, attribution_session_id, event_id,
    event_promoter_id, touched_at, expires_at
  ) values (
    resolved.organization_id, resolved_attribution_session_id, resolved.id,
    resolved.event_promoter_id, now(), effective_expiry
  )
  on conflict (attribution_session_id, event_id) do update
  set event_promoter_id = excluded.event_promoter_id,
      touched_at = excluded.touched_at,
      expires_at = excluded.expires_at;

  if not exists (
    select 1 from public.promoter_link_visits v
    where v.event_promoter_id = resolved.event_promoter_id
      and v.anonymous_session_id = resolved_anonymous_session_id
      and v.visited_at > now() - interval '30 minutes'
  ) then
    insert into public.promoter_link_visits (
      organization_id, event_id, event_promoter_id, anonymous_session_id
    ) values (
      resolved.organization_id, resolved.id,
      resolved.event_promoter_id, resolved_anonymous_session_id
    );
  end if;

  return query select resolved.id, resolved.event_promoter_id,
    resolved.display_name, effective_expiry;
end;
$$;

create function public.get_active_promoter_attribution(
  target_event uuid,
  target_session_hash text
)
returns table (
  event_promoter_id uuid,
  promoter_id uuid,
  promoter_display_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ep.id, p.id, p.display_name, a.expires_at
  from public.promoter_attribution_sessions s
  join public.promoter_attributions a on a.attribution_session_id = s.id
  join public.event_promoters ep on ep.id = a.event_promoter_id
  join public.promoters p on p.id = ep.promoter_id
  where s.session_token_hash = target_session_hash
    and s.expires_at > now()
    and a.event_id = target_event
    and a.expires_at > now()
    and ep.event_id = target_event
    and ep.status = 'active'
    and p.status = 'active';
$$;

create function public.create_guest_checkout_attributed(
  target_event uuid,
  buyer_first_name text,
  buyer_last_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  selections jsonb,
  target_attribution_session_hash text
)
returns table (order_public_id text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_order_public_id text;
  generated_expiry timestamptz;
  attribution record;
  attributed_order public.orders;
begin
  if jsonb_typeof(selections) = 'array' and exists (
    select 1
    from jsonb_array_elements(selections) selection
    left join public.ticket_types t on t.id = (selection->>'ticket_type_id')::uuid
    where not coalesce(t.publicly_available, false)
  ) then
    raise exception 'INVALID_SELECTION' using errcode = 'P0001';
  end if;

  select checkout.order_public_id, checkout.expires_at
  into generated_order_public_id, generated_expiry
  from public.create_guest_checkout_internal(
    target_event, buyer_first_name, buyer_last_name, buyer_email,
    buyer_phone, buyer_document, selections
  ) checkout;

  if target_attribution_session_hash ~ '^[0-9a-f]{64}$' then
    select * into attribution
    from public.get_active_promoter_attribution(target_event, target_attribution_session_hash);
  end if;

  if attribution.event_promoter_id is not null then
    update public.orders
    set event_promoter_id = attribution.event_promoter_id,
        promoter_id = attribution.promoter_id
    where public_id = generated_order_public_id
    returning * into attributed_order;

    insert into public.audit_logs (
      organization_id, action, entity_type, entity_id, after_data
    ) values (
      attributed_order.organization_id, 'promoter.attribution.created',
      'order', attributed_order.id,
      jsonb_build_object(
        'event_promoter_id', attribution.event_promoter_id,
        'promoter_id', attribution.promoter_id
      )
    );
  end if;

  return query select generated_order_public_id, generated_expiry;
end;
$$;

create function public.calculate_promoter_percentage(
  target_base_amount bigint,
  target_basis_points bigint
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select floor((target_base_amount::numeric * target_basis_points + 5000) / 10000)::bigint;
$$;

create function public.calculate_promoter_commissions_for_order(target_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.orders;
  item_row public.order_items;
  rule_row public.promoter_commission_rules;
  calculated_amount bigint;
  inserted_commission_id uuid;
  inserted_count integer := 0;
begin
  select * into order_row from public.orders where id = target_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if order_row.status <> 'paid' or order_row.event_promoter_id is null then
    return 0;
  end if;

  for item_row in
    select * from public.order_items i
    where i.order_id = order_row.id
    order by i.id
    for update
  loop
    select * into rule_row
    from public.promoter_commission_rules r
    where r.event_promoter_id = order_row.event_promoter_id
      and r.active
      and (r.ticket_type_id = item_row.ticket_type_id or r.ticket_type_id is null)
    order by (r.ticket_type_id is not null) desc
    limit 1;

    if rule_row.id is null then
      raise exception 'COMMISSION_RULE_MISSING' using errcode = 'P0001';
    end if;

    if rule_row.commission_type = 'fixed_per_ticket' then
      calculated_amount := rule_row.commission_value * item_row.quantity;
    else
      calculated_amount := public.calculate_promoter_percentage(
        item_row.line_total_amount, rule_row.commission_value
      );
    end if;

    inserted_commission_id := null;
    insert into public.promoter_commissions (
      organization_id, event_id, promoter_id, event_promoter_id,
      order_id, order_item_id, commission_rule_id,
      commission_type, commission_value, base_amount, quantity,
      commission_amount, currency, status, confirmed_at
    ) values (
      order_row.organization_id, order_row.event_id, order_row.promoter_id,
      order_row.event_promoter_id, order_row.id, item_row.id, rule_row.id,
      rule_row.commission_type, rule_row.commission_value,
      item_row.line_total_amount, item_row.quantity,
      calculated_amount, item_row.currency, 'confirmed', now()
    )
    on conflict (order_item_id) do nothing
    returning id into inserted_commission_id;

    if inserted_commission_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.audit_logs (
        organization_id, action, entity_type, entity_id, after_data
      ) values (
        order_row.organization_id, 'commission.confirmed',
        'promoter_commission', inserted_commission_id,
        jsonb_build_object(
          'order_id', order_row.id,
          'order_item_id', item_row.id,
          'commission_amount', calculated_amount,
          'currency', item_row.currency
        )
      );
    end if;
  end loop;

  return inserted_count;
end;
$$;

create function public.reconcile_event_promoter_commissions(target_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.events;
  order_row record;
  reconciled integer := 0;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  for order_row in
    select o.id from public.orders o
    where o.event_id = target_event
      and o.status = 'paid'
      and o.event_promoter_id is not null
    order by o.id
  loop
    reconciled := reconciled + public.calculate_promoter_commissions_for_order(order_row.id);
  end loop;
  return reconciled;
end;
$$;

create function public.reconcile_promoter_session_commissions(target_session_hash text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_promoter_id uuid;
  order_row record;
  reconciled integer := 0;
begin
  select s.promoter_id into session_promoter_id
  from public.promoter_sessions s
  join public.promoters p on p.id = s.promoter_id and p.status = 'active'
  where s.session_hash = target_session_hash
    and s.revoked_at is null and s.expires_at > now();
  if session_promoter_id is null then
    raise exception 'PROMOTER_SESSION_REQUIRED' using errcode = 'P0001';
  end if;

  for order_row in
    select o.id from public.orders o
    where o.promoter_id = session_promoter_id
      and o.status = 'paid'
    order by o.id
  loop
    reconciled := reconciled + public.calculate_promoter_commissions_for_order(order_row.id);
  end loop;
  return reconciled;
end;
$$;

create function public.refund_promoter_commissions_after_order_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare refunded_commission record;
begin
  if new.status = 'refunded' and old.status is distinct from new.status then
    for refunded_commission in
      update public.promoter_commissions
      set status = 'refunded', refunded_at = coalesce(refunded_at, now())
      where order_id = new.id and status not in ('refunded', 'cancelled')
      returning id, organization_id, commission_amount, currency
    loop
      insert into public.audit_logs (
        organization_id, action, entity_type, entity_id, after_data
      ) values (
        refunded_commission.organization_id, 'commission.refunded',
        'promoter_commission', refunded_commission.id,
        jsonb_build_object(
          'order_id', new.id,
          'commission_amount', refunded_commission.commission_amount,
          'currency', refunded_commission.currency
        )
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger orders_refund_promoter_commissions
after update of status on public.orders
for each row execute function public.refund_promoter_commissions_after_order_refund();

create function public.get_event_promoter_metrics(target_event uuid)
returns table (
  event_promoter_id uuid,
  promoter_id uuid,
  display_name text,
  public_slug text,
  status public.event_promoter_status,
  tickets_sold bigint,
  ticket_revenue bigint,
  confirmed_commission bigint,
  visits bigint,
  paid_orders bigint,
  currency char(3)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;

  return query
  with sales as (
    select o.event_promoter_id,
      count(distinct o.id)::bigint as paid_orders,
      coalesce(sum(i.quantity), 0)::bigint as tickets_sold,
      coalesce(sum(i.line_total_amount), 0)::bigint as ticket_revenue
    from public.orders o
    join public.order_items i on i.order_id = o.id
    where o.event_id = target_event and o.status = 'paid'
      and o.event_promoter_id is not null
    group by o.event_promoter_id
  ), commissions as (
    select c.event_promoter_id,
      coalesce(sum(c.commission_amount), 0)::bigint as confirmed_commission
    from public.promoter_commissions c
    where c.event_id = target_event and c.status = 'confirmed'
    group by c.event_promoter_id
  ), visit_counts as (
    select v.event_promoter_id, count(*)::bigint as visits
    from public.promoter_link_visits v
    where v.event_id = target_event
    group by v.event_promoter_id
  )
  select ep.id, p.id, p.display_name, ep.public_slug, ep.status,
    coalesce(s.tickets_sold, 0), coalesce(s.ticket_revenue, 0),
    coalesce(c.confirmed_commission, 0), coalesce(v.visits, 0),
    coalesce(s.paid_orders, 0), event_row.currency
  from public.event_promoters ep
  join public.promoters p on p.id = ep.promoter_id
  left join sales s on s.event_promoter_id = ep.id
  left join commissions c on c.event_promoter_id = ep.id
  left join visit_counts v on v.event_promoter_id = ep.id
  where ep.event_id = target_event
  order by coalesce(s.tickets_sold, 0) desc, p.display_name;
end;
$$;

create function public.get_event_attribution_metrics(target_event uuid)
returns table (
  promoter_ticket_revenue bigint,
  direct_ticket_revenue bigint,
  promoter_tickets bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare event_row public.events;
begin
  select * into event_row from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(event_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return query
  select
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is not null), 0)::bigint,
    coalesce(sum(i.line_total_amount) filter (where o.event_promoter_id is null), 0)::bigint,
    coalesce(sum(i.quantity) filter (where o.event_promoter_id is not null), 0)::bigint
  from public.orders o
  join public.order_items i on i.order_id = o.id
  where o.event_id = target_event and o.status = 'paid';
end;
$$;

create function public.get_event_promoter_detail(target_event_promoter uuid)
returns table (
  tickets_sold bigint,
  ticket_revenue bigint,
  confirmed_commission bigint,
  visits bigint,
  ticket_breakdown jsonb,
  recent_sales jsonb,
  currency char(3)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_promoter_row public.event_promoters;
  event_currency char(3);
begin
  select * into event_promoter_row
  from public.event_promoters where id = target_event_promoter;
  if not found or auth.uid() is null or not public.can_manage_org(event_promoter_row.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  select e.currency into event_currency from public.events e where e.id = event_promoter_row.event_id;

  return query
  select
    coalesce((
      select sum(i.quantity)::bigint
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.event_promoter_id = target_event_promoter and o.status = 'paid'
    ), 0),
    coalesce((
      select sum(i.line_total_amount)::bigint
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.event_promoter_id = target_event_promoter and o.status = 'paid'
    ), 0),
    coalesce((
      select sum(c.commission_amount)::bigint
      from public.promoter_commissions c
      where c.event_promoter_id = target_event_promoter and c.status = 'confirmed'
    ), 0),
    (select count(*)::bigint from public.promoter_link_visits v where v.event_promoter_id = target_event_promoter),
    coalesce((
      select jsonb_agg(
        jsonb_build_object('ticket_type_id', grouped.ticket_type_id, 'name', grouped.item_name, 'quantity', grouped.quantity)
        order by grouped.quantity desc, grouped.item_name
      )
      from (
        select i.ticket_type_id, max(i.item_name) as item_name, sum(i.quantity)::bigint as quantity
        from public.orders o join public.order_items i on i.order_id = o.id
        where o.event_promoter_id = target_event_promoter and o.status = 'paid'
        group by i.ticket_type_id
      ) grouped
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'order_id', recent.order_id,
          'quantity', recent.quantity,
          'ticket_revenue', recent.ticket_revenue,
          'items', recent.items,
          'created_at', recent.created_at
        ) order by recent.created_at desc
      )
      from (
        select o.id as order_id, sum(i.quantity)::bigint as quantity,
          sum(i.line_total_amount)::bigint as ticket_revenue,
          string_agg(i.quantity::text || ' × ' || i.item_name, ', ' order by i.created_at) as items,
          o.created_at
        from public.orders o join public.order_items i on i.order_id = o.id
        where o.event_promoter_id = target_event_promoter and o.status = 'paid'
        group by o.id
        order by o.created_at desc
        limit 8
      ) recent
    ), '[]'::jsonb),
    event_currency;
end;
$$;

create function public.get_promoter_dashboard(target_session_hash text)
returns table (
  event_promoter_id uuid,
  event_id uuid,
  event_name text,
  event_slug text,
  event_starts_at timestamptz,
  event_timezone text,
  public_slug text,
  relation_status public.event_promoter_status,
  tickets_sold bigint,
  ticket_revenue bigint,
  confirmed_commission bigint,
  visits bigint,
  currency char(3)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare session_promoter_id uuid;
begin
  select s.promoter_id into session_promoter_id
  from public.promoter_sessions s
  join public.promoters p on p.id = s.promoter_id and p.status = 'active'
  where s.session_hash = target_session_hash
    and s.revoked_at is null and s.expires_at > now();
  if session_promoter_id is null then return; end if;

  return query
  with sales as (
    select o.event_promoter_id,
      coalesce(sum(i.quantity), 0)::bigint as tickets_sold,
      coalesce(sum(i.line_total_amount), 0)::bigint as ticket_revenue
    from public.orders o join public.order_items i on i.order_id = o.id
    where o.promoter_id = session_promoter_id and o.status = 'paid'
    group by o.event_promoter_id
  ), commissions as (
    select c.event_promoter_id, sum(c.commission_amount)::bigint as confirmed_commission
    from public.promoter_commissions c
    where c.promoter_id = session_promoter_id and c.status = 'confirmed'
    group by c.event_promoter_id
  ), visits as (
    select v.event_promoter_id, count(*)::bigint as visits
    from public.promoter_link_visits v
    join public.event_promoters ep on ep.id = v.event_promoter_id
    where ep.promoter_id = session_promoter_id
    group by v.event_promoter_id
  )
  select ep.id, e.id, e.name, e.slug, e.starts_at, venue_row.timezone, ep.public_slug, ep.status,
    coalesce(s.tickets_sold, 0), coalesce(s.ticket_revenue, 0),
    coalesce(c.confirmed_commission, 0), coalesce(visit_metrics.visits, 0), e.currency
  from public.event_promoters ep
  join public.events e on e.id = ep.event_id
  join public.venues venue_row on venue_row.id = e.venue_id
  left join sales s on s.event_promoter_id = ep.id
  left join commissions c on c.event_promoter_id = ep.id
  left join visits visit_metrics on visit_metrics.event_promoter_id = ep.id
  where ep.promoter_id = session_promoter_id
  order by e.starts_at desc;
end;
$$;

create function public.get_promoter_event_dashboard(
  target_session_hash text,
  target_event_promoter uuid
)
returns table (
  event_promoter_id uuid,
  event_name text,
  event_slug text,
  event_starts_at timestamptz,
  event_timezone text,
  public_slug text,
  relation_status public.event_promoter_status,
  tickets_sold bigint,
  ticket_revenue bigint,
  confirmed_commission bigint,
  visits bigint,
  ticket_breakdown jsonb,
  recent_sales jsonb,
  currency char(3)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare session_promoter_id uuid;
begin
  select s.promoter_id into session_promoter_id
  from public.promoter_sessions s
  join public.promoters p on p.id = s.promoter_id and p.status = 'active'
  where s.session_hash = target_session_hash
    and s.revoked_at is null and s.expires_at > now();
  if session_promoter_id is null or not exists (
    select 1 from public.event_promoters ep
    where ep.id = target_event_promoter and ep.promoter_id = session_promoter_id
  ) then return; end if;

  return query
  select ep.id, e.name, e.slug, e.starts_at, venue_row.timezone, ep.public_slug, ep.status,
    coalesce((
      select sum(i.quantity)::bigint
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.event_promoter_id = ep.id and o.status = 'paid'
    ), 0),
    coalesce((
      select sum(i.line_total_amount)::bigint
      from public.orders o join public.order_items i on i.order_id = o.id
      where o.event_promoter_id = ep.id and o.status = 'paid'
    ), 0),
    coalesce((
      select sum(c.commission_amount)::bigint from public.promoter_commissions c
      where c.event_promoter_id = ep.id and c.status = 'confirmed'
    ), 0),
    (select count(*)::bigint from public.promoter_link_visits v where v.event_promoter_id = ep.id),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', grouped.item_name, 'quantity', grouped.quantity) order by grouped.quantity desc)
      from (
        select max(i.item_name) as item_name, sum(i.quantity)::bigint as quantity
        from public.orders o join public.order_items i on i.order_id = o.id
        where o.event_promoter_id = ep.id and o.status = 'paid'
        group by i.ticket_type_id
      ) grouped
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity', recent.quantity,
        'ticket_revenue', recent.ticket_revenue,
        'items', recent.items,
        'created_at', recent.created_at
      ) order by recent.created_at desc)
      from (
        select o.id, sum(i.quantity)::bigint as quantity,
          sum(i.line_total_amount)::bigint as ticket_revenue,
          string_agg(i.quantity::text || ' × ' || i.item_name, ', ' order by i.created_at) as items,
          o.created_at
        from public.orders o join public.order_items i on i.order_id = o.id
        where o.event_promoter_id = ep.id and o.status = 'paid'
        group by o.id
        order by o.created_at desc
        limit 8
      ) recent
    ), '[]'::jsonb),
    e.currency
  from public.event_promoters ep
  join public.events e on e.id = ep.event_id
  join public.venues venue_row on venue_row.id = e.venue_id
  where ep.id = target_event_promoter and ep.promoter_id = session_promoter_id;
end;
$$;

create function public.duplicate_event_with_options(
  target_event uuid,
  target_name text,
  target_slug text,
  target_starts_at timestamptz,
  preserve_promoters boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_event public.events;
  new_event_id uuid := gen_random_uuid();
  date_delta interval;
  phase_row public.sale_phases;
  ticket_type_row public.ticket_types;
  event_promoter_row public.event_promoters;
  rule_row public.promoter_commission_rules;
  new_phase_id uuid;
  new_ticket_type_id uuid;
  new_event_promoter_id uuid;
  mapped_ticket_type_id uuid;
  phase_map jsonb := '{}'::jsonb;
  ticket_type_map jsonb := '{}'::jsonb;
begin
  select * into source_event from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(source_event.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(trim(target_name)) not between 2 and 140
    or lower(trim(target_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or target_starts_at <= now() then
    raise exception 'INVALID_EVENT_DUPLICATION' using errcode = 'P0001';
  end if;

  date_delta := target_starts_at - source_event.starts_at;
  insert into public.events (
    id, organization_id, venue_id, name, slug, description, cover_image_url,
    starts_at, doors_open_at, ends_at, status, capacity, require_document,
    currency, published_at, created_by
  ) values (
    new_event_id, source_event.organization_id, source_event.venue_id,
    trim(target_name), lower(trim(target_slug)), source_event.description,
    source_event.cover_image_url, target_starts_at,
    case when source_event.doors_open_at is null then null else source_event.doors_open_at + date_delta end,
    case when source_event.ends_at is null then null else source_event.ends_at + date_delta end,
    'draft', source_event.capacity, source_event.require_document,
    source_event.currency, null, auth.uid()
  );

  for phase_row in
    select * from public.sale_phases p
    where p.event_id = source_event.id order by p.sort_order, p.id
  loop
    new_phase_id := gen_random_uuid();
    insert into public.sale_phases (
      id, organization_id, event_id, name, sort_order, activate_next_when_sold_out
    ) values (
      new_phase_id, source_event.organization_id, new_event_id,
      phase_row.name, phase_row.sort_order, phase_row.activate_next_when_sold_out
    );
    phase_map := phase_map || jsonb_build_object(phase_row.id::text, new_phase_id::text);
  end loop;

  for ticket_type_row in
    select * from public.ticket_types t
    where t.event_id = source_event.id order by t.sort_order, t.id
  loop
    new_ticket_type_id := gen_random_uuid();
    new_phase_id := case
      when ticket_type_row.sale_phase_id is null then null
      else (phase_map ->> ticket_type_row.sale_phase_id::text)::uuid
    end;
    insert into public.ticket_types (
      id, organization_id, event_id, sale_phase_id, name, description,
      price_amount, currency, quantity, max_per_order,
      sales_start, sales_end, active, publicly_available, sort_order
    ) values (
      new_ticket_type_id, source_event.organization_id, new_event_id, new_phase_id,
      ticket_type_row.name, ticket_type_row.description,
      ticket_type_row.price_amount, ticket_type_row.currency,
      ticket_type_row.quantity, ticket_type_row.max_per_order,
      case when ticket_type_row.sales_start is null then null else ticket_type_row.sales_start + date_delta end,
      case when ticket_type_row.sales_end is null then null else ticket_type_row.sales_end + date_delta end,
      ticket_type_row.active, ticket_type_row.publicly_available, ticket_type_row.sort_order
    );
    ticket_type_map := ticket_type_map || jsonb_build_object(ticket_type_row.id::text, new_ticket_type_id::text);
  end loop;

  if preserve_promoters then
    for event_promoter_row in
      select * from public.event_promoters ep
      where ep.event_id = source_event.id and ep.status = 'active'
      order by ep.id
    loop
      new_event_promoter_id := gen_random_uuid();
      insert into public.event_promoters (
        id, organization_id, event_id, promoter_id, public_slug, status
      ) values (
        new_event_promoter_id, source_event.organization_id, new_event_id,
        event_promoter_row.promoter_id, event_promoter_row.public_slug, 'active'
      );

      for rule_row in
        select * from public.promoter_commission_rules r
        where r.event_promoter_id = event_promoter_row.id and r.active
        order by r.ticket_type_id nulls first, r.id
      loop
        mapped_ticket_type_id := case
          when rule_row.ticket_type_id is null then null
          else (ticket_type_map ->> rule_row.ticket_type_id::text)::uuid
        end;
        insert into public.promoter_commission_rules (
          organization_id, event_id, event_promoter_id, ticket_type_id,
          commission_type, commission_value, currency, active
        ) values (
          source_event.organization_id, new_event_id, new_event_promoter_id,
          mapped_ticket_type_id, rule_row.commission_type,
          rule_row.commission_value, rule_row.currency, true
        );
      end loop;
    end loop;
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    source_event.organization_id, auth.uid(), 'event.duplicated', 'event', new_event_id,
    jsonb_build_object(
      'source_event_id', source_event.id,
      'preserve_promoters', preserve_promoters
    )
  );
  return new_event_id;
end;
$$;

revoke all on function public.create_event_promoter(uuid, text, text, text, text, text, text, public.promoter_commission_type, bigint) from public, anon, authenticated;
revoke all on function public.update_event_promoter(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.set_event_promoter_status(uuid, public.event_promoter_status) from public, anon, authenticated;
revoke all on function public.upsert_promoter_commission_rule(uuid, uuid, public.promoter_commission_type, bigint) from public, anon, authenticated;
revoke all on function public.create_promoter_access_token(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.exchange_promoter_access_token(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_promoter_session(text) from public, anon, authenticated;
revoke all on function public.revoke_promoter_session(text) from public, anon, authenticated;
revoke all on function public.record_promoter_link_visit(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_active_promoter_attribution(uuid, text) from public, anon, authenticated;
revoke all on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.calculate_promoter_percentage(bigint, bigint) from public, anon, authenticated;
revoke all on function public.calculate_promoter_commissions_for_order(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_event_promoter_commissions(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_promoter_session_commissions(text) from public, anon, authenticated;
revoke all on function public.refund_promoter_commissions_after_order_refund() from public, anon, authenticated;
revoke all on function public.get_event_promoter_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_attribution_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_promoter_detail(uuid) from public, anon, authenticated;
revoke all on function public.get_promoter_dashboard(text) from public, anon, authenticated;
revoke all on function public.get_promoter_event_dashboard(text, uuid) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;

grant execute on function public.create_event_promoter(uuid, text, text, text, text, text, text, public.promoter_commission_type, bigint) to authenticated;
grant execute on function public.update_event_promoter(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_event_promoter_status(uuid, public.event_promoter_status) to authenticated;
grant execute on function public.upsert_promoter_commission_rule(uuid, uuid, public.promoter_commission_type, bigint) to authenticated;
grant execute on function public.create_promoter_access_token(uuid, text, timestamptz) to authenticated;
grant execute on function public.reconcile_event_promoter_commissions(uuid) to authenticated;
grant execute on function public.get_event_promoter_metrics(uuid) to authenticated;
grant execute on function public.get_event_attribution_metrics(uuid) to authenticated;
grant execute on function public.get_event_promoter_detail(uuid) to authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean) to authenticated;

grant execute on function public.exchange_promoter_access_token(text, text, timestamptz) to service_role;
grant execute on function public.get_promoter_session(text) to service_role;
grant execute on function public.revoke_promoter_session(text) to service_role;
grant execute on function public.record_promoter_link_visit(text, text, text, uuid) to service_role;
grant execute on function public.get_active_promoter_attribution(uuid, text) to service_role;
grant execute on function public.create_guest_checkout_attributed(uuid, text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.calculate_promoter_commissions_for_order(uuid) to service_role;
grant execute on function public.reconcile_promoter_session_commissions(text) to service_role;
grant execute on function public.get_promoter_dashboard(text) to service_role;
grant execute on function public.get_promoter_event_dashboard(text, uuid) to service_role;
