insert into public.promoter_commission_rules (
  organization_id, event_id, event_promoter_id, subject_type,
  ticket_type_id, event_table_id, commission_type, commission_value, currency, active
)
select r.organization_id, r.event_id, r.event_promoter_id, 'table',
  null, null, r.commission_type, r.commission_value, r.currency, true
from public.promoter_commission_rules r
where r.subject_type = 'ticket' and r.ticket_type_id is null and r.active
on conflict (event_promoter_id, subject_type)
  where ticket_type_id is null and event_table_id is null and active
do nothing;

create function public.create_default_table_commission_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_type = 'ticket' and new.ticket_type_id is null and new.active then
    insert into public.promoter_commission_rules (
      organization_id, event_id, event_promoter_id, subject_type,
      ticket_type_id, event_table_id, commission_type, commission_value, currency, active
    ) values (
      new.organization_id, new.event_id, new.event_promoter_id, 'table',
      null, null, new.commission_type, new.commission_value, new.currency, true
    )
    on conflict (event_promoter_id, subject_type)
      where ticket_type_id is null and event_table_id is null and active
    do nothing;
  end if;
  return new;
end;
$$;

create trigger promoter_rules_create_table_default
after insert on public.promoter_commission_rules
for each row execute function public.create_default_table_commission_rule();

create function public.upsert_promoter_table_commission_rule(
  target_event_promoter uuid,
  target_event_table uuid,
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
  if target_event_table is not null and not exists (
    select 1 from public.event_tables et
    where et.id = target_event_table and et.event_id = event_promoter_row.event_id
  ) then
    raise exception 'INVALID_EVENT_TABLE' using errcode = 'P0001';
  end if;
  if (target_commission_type = 'fixed_per_ticket' and target_commission_value <= 0)
    or (target_commission_type = 'percentage' and target_commission_value not between 1 and 10000) then
    raise exception 'INVALID_COMMISSION_RULE' using errcode = 'P0001';
  end if;
  select * into existing_rule
  from public.promoter_commission_rules r
  where r.event_promoter_id = target_event_promoter
    and r.subject_type = 'table'
    and r.event_table_id is not distinct from target_event_table
    and r.active
  for update;
  if existing_rule.id is null then
    insert into public.promoter_commission_rules (
      organization_id, event_id, event_promoter_id, subject_type,
      event_table_id, commission_type, commission_value, currency
    ) values (
      event_promoter_row.organization_id, event_promoter_row.event_id,
      event_promoter_row.id, 'table', target_event_table,
      target_commission_type, target_commission_value, event_row.currency
    ) returning id into resulting_rule_id;
  else
    update public.promoter_commission_rules
    set commission_type = target_commission_type,
        commission_value = target_commission_value,
        currency = event_row.currency
    where id = existing_rule.id returning id into resulting_rule_id;
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
      'subject_type', 'table', 'event_table_id', target_event_table,
      'commission_type', target_commission_type, 'commission_value', target_commission_value
    )
  );
  return resulting_rule_id;
end;
$$;

create or replace function public.calculate_promoter_commissions_for_order(target_order uuid)
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
  item_subject public.commission_subject_type;
begin
  select * into order_row from public.orders where id = target_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if order_row.status <> 'paid' or order_row.event_promoter_id is null then return 0; end if;
  for item_row in
    select * from public.order_items i where i.order_id = order_row.id order by i.id for update
  loop
    item_subject := item_row.item_type::text::public.commission_subject_type;
    select * into rule_row
    from public.promoter_commission_rules r
    where r.event_promoter_id = order_row.event_promoter_id
      and r.subject_type = item_subject and r.active
      and (
        (item_subject = 'ticket' and (r.ticket_type_id = item_row.ticket_type_id or r.ticket_type_id is null))
        or (item_subject = 'table' and (r.event_table_id = item_row.event_table_id or r.event_table_id is null))
      )
    order by case
      when item_subject = 'ticket' then (r.ticket_type_id is not null)::integer
      else (r.event_table_id is not null)::integer
    end desc
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
      subject_type, event_table_id, commission_type, commission_value,
      base_amount, quantity, commission_amount, currency, status, confirmed_at
    ) values (
      order_row.organization_id, order_row.event_id, order_row.promoter_id,
      order_row.event_promoter_id, order_row.id, item_row.id, rule_row.id,
      item_subject, item_row.event_table_id, rule_row.commission_type, rule_row.commission_value,
      item_row.line_total_amount, item_row.quantity, calculated_amount,
      item_row.currency, 'confirmed', now()
    ) on conflict (order_item_id) do nothing returning id into inserted_commission_id;
    if inserted_commission_id is not null then
      inserted_count := inserted_count + 1;
      insert into public.audit_logs (
        organization_id, action, entity_type, entity_id, after_data
      ) values (
        order_row.organization_id, 'commission.confirmed', 'promoter_commission', inserted_commission_id,
        jsonb_build_object(
          'order_id', order_row.id, 'order_item_id', item_row.id,
          'subject_type', item_subject, 'commission_amount', calculated_amount,
          'currency', item_row.currency
        )
      );
    end if;
  end loop;
  return inserted_count;
end;
$$;

create function public.get_event_promoter_table_metrics(target_event uuid)
returns table (
  event_promoter_id uuid,
  tables_sold bigint,
  table_revenue bigint
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
  select ep.id,
    count(i.id) filter (where o.status = 'paid')::bigint,
    coalesce(sum(i.line_total_amount) filter (where o.status = 'paid'), 0)::bigint
  from public.event_promoters ep
  left join public.orders o on o.event_promoter_id = ep.id
  left join public.order_items i on i.order_id = o.id and i.item_type = 'table'
  where ep.event_id = target_event
  group by ep.id;
end;
$$;

create function public.get_event_table_attribution_metrics(target_event uuid)
returns table (
  promoter_table_revenue bigint,
  direct_table_revenue bigint,
  promoter_tables bigint
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
    count(i.id) filter (where o.event_promoter_id is not null)::bigint
  from public.orders o
  join public.order_items i on i.order_id = o.id and i.item_type = 'table'
  where o.event_id = target_event and o.status = 'paid';
end;
$$;

create function public.get_promoter_table_dashboard(target_session_hash text)
returns table (
  event_promoter_id uuid,
  tables_sold bigint,
  table_revenue bigint
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
  select ep.id, count(i.id)::bigint, coalesce(sum(i.line_total_amount), 0)::bigint
  from public.event_promoters ep
  left join public.orders o on o.event_promoter_id = ep.id and o.status = 'paid'
  left join public.order_items i on i.order_id = o.id and i.item_type = 'table'
  where ep.promoter_id = session_promoter_id
  group by ep.id;
end;
$$;

create function public.get_promoter_event_table_dashboard(
  target_session_hash text,
  target_event_promoter uuid
)
returns table (
  tables_sold bigint,
  table_revenue bigint,
  table_breakdown jsonb
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
  select count(i.id)::bigint, coalesce(sum(i.line_total_amount), 0)::bigint,
    coalesce(jsonb_agg(jsonb_build_object(
      'event_table_id', i.event_table_id, 'name', i.item_name,
      'amount', i.line_total_amount, 'created_at', o.created_at
    ) order by o.created_at desc), '[]'::jsonb)
  from public.orders o
  join public.order_items i on i.order_id = o.id and i.item_type = 'table'
  where o.event_promoter_id = target_event_promoter and o.status = 'paid';
end;
$$;

alter function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean)
rename to duplicate_event_phase_4;

create function public.duplicate_event_with_options(
  target_event uuid,
  target_name text,
  target_slug text,
  target_starts_at timestamptz,
  preserve_promoters boolean,
  preserve_tables boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_event public.events;
  new_event_id uuid;
  zone_row public.table_zones;
  table_row public.event_tables;
  template_row public.table_entitlement_templates;
  event_promoter_row public.event_promoters;
  rule_row public.promoter_commission_rules;
  new_zone_id uuid;
  new_table_id uuid;
  new_event_promoter_id uuid;
  mapped_ticket_type_id uuid;
  mapped_event_table_id uuid;
begin
  select * into source_event from public.events where id = target_event for update;
  if not found or auth.uid() is null or not public.can_manage_org(source_event.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  new_event_id := public.duplicate_event_phase_4(
    target_event, target_name, target_slug, target_starts_at, false
  );
  if preserve_tables then
    for zone_row in
      select * from public.table_zones z where z.event_id = target_event order by z.sort_order, z.id
    loop
      insert into public.table_zones (
        organization_id, event_id, name, description, sort_order, active
      ) values (
        source_event.organization_id, new_event_id, zone_row.name,
        zone_row.description, zone_row.sort_order, zone_row.active
      ) returning id into new_zone_id;
      for table_row in
        select * from public.event_tables et
        where et.table_zone_id = zone_row.id order by et.sort_order, et.id
      loop
        insert into public.event_tables (
          organization_id, event_id, table_zone_id, access_gate_id,
          name, description, capacity, base_price_amount, currency,
          service_fee_bps, active, sort_order
        ) values (
          source_event.organization_id, new_event_id, new_zone_id, null,
          table_row.name, table_row.description, table_row.capacity,
          table_row.base_price_amount, table_row.currency,
          table_row.service_fee_bps, table_row.active, table_row.sort_order
        ) returning id into new_table_id;
        for template_row in
          select * from public.table_entitlement_templates template
          where template.event_table_id = table_row.id order by template.sort_order, template.id
        loop
          insert into public.table_entitlement_templates (
            organization_id, event_id, event_table_id, entitlement_type,
            reference_id, name, quantity, metadata, sort_order
          ) values (
            source_event.organization_id, new_event_id, new_table_id,
            template_row.entitlement_type, template_row.reference_id,
            template_row.name, template_row.quantity,
            template_row.metadata, template_row.sort_order
          );
        end loop;
      end loop;
    end loop;
  end if;

  if preserve_promoters then
    for event_promoter_row in
      select * from public.event_promoters ep
      where ep.event_id = target_event and ep.status = 'active' order by ep.id
    loop
      insert into public.event_promoters (
        organization_id, event_id, promoter_id, public_slug, status
      ) values (
        source_event.organization_id, new_event_id,
        event_promoter_row.promoter_id, event_promoter_row.public_slug, 'active'
      ) returning id into new_event_promoter_id;
      for rule_row in
        select * from public.promoter_commission_rules r
        where r.event_promoter_id = event_promoter_row.id and r.active
        order by r.subject_type, r.ticket_type_id nulls first, r.event_table_id nulls first, r.id
      loop
        mapped_ticket_type_id := null;
        mapped_event_table_id := null;
        if rule_row.ticket_type_id is not null then
          select target.id into mapped_ticket_type_id
          from public.ticket_types source
          join public.ticket_types target on target.event_id = new_event_id and target.name = source.name
          where source.id = rule_row.ticket_type_id;
        end if;
        if rule_row.event_table_id is not null and preserve_tables then
          select target.id into mapped_event_table_id
          from public.event_tables source
          join public.event_tables target on target.event_id = new_event_id and target.name = source.name
          where source.id = rule_row.event_table_id;
        end if;
        if rule_row.subject_type = 'ticket' then
          insert into public.promoter_commission_rules (
            organization_id, event_id, event_promoter_id, subject_type,
            ticket_type_id, commission_type, commission_value, currency, active
          ) values (
            source_event.organization_id, new_event_id, new_event_promoter_id, 'ticket',
            mapped_ticket_type_id, rule_row.commission_type,
            rule_row.commission_value, rule_row.currency, true
          );
        elsif rule_row.event_table_id is null or preserve_tables then
          insert into public.promoter_commission_rules (
            organization_id, event_id, event_promoter_id, subject_type,
            event_table_id, commission_type, commission_value, currency, active
          ) values (
            source_event.organization_id, new_event_id, new_event_promoter_id, 'table',
            mapped_event_table_id, rule_row.commission_type,
            rule_row.commission_value, rule_row.currency, true
          )
          on conflict (event_promoter_id, subject_type)
            where ticket_type_id is null and event_table_id is null and active
          do update set commission_type = excluded.commission_type,
            commission_value = excluded.commission_value,
            currency = excluded.currency;
        end if;
      end loop;
    end loop;
  end if;
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    source_event.organization_id, auth.uid(), 'event.duplicated_options', 'event', new_event_id,
    jsonb_build_object(
      'source_event_id', target_event,
      'preserve_promoters', preserve_promoters,
      'preserve_tables', preserve_tables
    )
  );
  return new_event_id;
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
language sql
security definer
set search_path = ''
as $$
  select public.duplicate_event_with_options(
    target_event, target_name, target_slug, target_starts_at,
    preserve_promoters, false
  );
$$;

revoke all on function public.create_default_table_commission_rule() from public, anon, authenticated;
revoke all on function public.upsert_promoter_table_commission_rule(uuid, uuid, public.promoter_commission_type, bigint) from public, anon, authenticated;
revoke all on function public.calculate_promoter_commissions_for_order(uuid) from public, anon, authenticated;
revoke all on function public.get_event_promoter_table_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_event_table_attribution_metrics(uuid) from public, anon, authenticated;
revoke all on function public.get_promoter_table_dashboard(text) from public, anon, authenticated;
revoke all on function public.get_promoter_event_table_dashboard(text, uuid) from public, anon, authenticated;
revoke all on function public.duplicate_event_phase_4(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean) from public, anon, authenticated;

grant execute on function public.upsert_promoter_table_commission_rule(uuid, uuid, public.promoter_commission_type, bigint) to authenticated;
grant execute on function public.get_event_promoter_table_metrics(uuid) to authenticated;
grant execute on function public.get_event_table_attribution_metrics(uuid) to authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean) to authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean) to authenticated;
grant execute on function public.calculate_promoter_commissions_for_order(uuid) to service_role;
grant execute on function public.get_promoter_table_dashboard(text) to service_role;
grant execute on function public.get_promoter_event_table_dashboard(text, uuid) to service_role;
