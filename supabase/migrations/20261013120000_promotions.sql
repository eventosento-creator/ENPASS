-- Cupones, códigos promocionales y descuentos para la venta de entradas.
--
-- Reglas financieras (acordadas):
--  * El descuento baja SOLO el precio de las entradas. El cargo de servicio de ENPASS se calcula, como siempre, sobre el precio base
--    original: create_guest_checkout_internal no se toca. El cupón se aplica en un paso posterior dentro de la MISMA transacción
--    (create_guest_checkout_promoted), así que si algo falla se deshace la orden completa, incluidas las reservas.
--  * Cupón del 100% ("free"): la compra se trata como cortesía (total 0, sin cargo, sin pasar por Mercado Pago, con el costo de
--    emisión de cortesía que ya existe en complete_free_order).
--  * orders.subtotal_amount pasa a ser el precio final de las entradas (lo que cobra el productor); list_subtotal_amount y
--    discount_amount guardan el precio base y el descuento por separado. order_items.line_total_amount = precio base - descuento.
--  * Un uso del cupón se RESERVA al crear la orden (vale lo que dura la reserva, 10 min), se CONFIRMA cuando la orden pasa a pagada,
--    se LIBERA si vence/cancela y queda "reembolsado" (se libera) si la orden se reembolsa por completo. Un reembolso parcial no libera.
--    Todo esto lo hace un trigger sobre orders.status: las funciones de pago no se modifican.

-- ---------------------------------------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------------------------------------

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  code text not null check (code ~ '^[A-Z0-9_-]{3,30}$'),
  description text check (description is null or char_length(description) <= 300),
  kind text not null check (kind in ('percent', 'fixed', 'free', 'two_for_one', 'special_price')),
  percent_bps integer check (percent_bps is null or percent_bps between 1 and 9999),
  fixed_amount bigint check (fixed_amount is null or fixed_amount > 0),
  special_price_amount bigint check (special_price_amount is null or special_price_amount > 0),
  active boolean not null default true,
  all_events boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  max_total_uses integer check (max_total_uses is null or max_total_uses >= 1),
  max_uses_per_buyer integer check (max_uses_per_buyer is null or max_uses_per_buyer >= 1),
  max_tickets_benefited integer check (max_tickets_benefited is null or max_tickets_benefited >= 1),
  min_tickets integer not null default 1 check (min_tickets >= 1),
  max_discount_amount bigint check (max_discount_amount is null or max_discount_amount > 0),
  channels text[] not null default array['web'],
  -- Reservado para evoluciones (no se usa todavía): promociones combinables, códigos de RRPP/influencers y campañas.
  stackable boolean not null default false,
  promoter_id uuid references public.promoters(id) on delete set null,
  campaign text check (campaign is null or char_length(campaign) <= 60),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((kind = 'percent') = (percent_bps is not null)),
  check ((kind = 'fixed') = (fixed_amount is not null)),
  check ((kind = 'special_price') = (special_price_amount is not null)),
  check (kind <> 'free' or max_tickets_benefited is not null)
);
create index if not exists promotions_org_idx on public.promotions (organization_id);

create table if not exists public.promotion_events (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  primary key (promotion_id, event_id)
);
create index if not exists promotion_events_event_idx on public.promotion_events (event_id);

-- Si una promoción no tiene filas acá, vale para todas las entradas de sus eventos; si tiene, solo para esos tipos de entrada.
create table if not exists public.promotion_ticket_types (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  primary key (promotion_id, ticket_type_id)
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade, -- un cupón por compra; también hace idempotente el canje
  buyer_email text not null,
  status text not null default 'reserved' check (status in ('reserved', 'confirmed', 'released', 'refunded')),
  tickets_benefited integer not null check (tickets_benefited >= 0),
  list_subtotal_amount bigint not null check (list_subtotal_amount >= 0),
  discount_amount bigint not null check (discount_amount >= 0),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  release_reason text
);
create index if not exists promotion_redemptions_promotion_idx on public.promotion_redemptions (promotion_id, status);
create index if not exists promotion_redemptions_buyer_idx on public.promotion_redemptions (promotion_id, buyer_email);
create index if not exists promotion_redemptions_org_created_idx on public.promotion_redemptions (organization_id, created_at desc);

alter table public.orders add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.orders add column if not exists list_subtotal_amount bigint check (list_subtotal_amount is null or list_subtotal_amount >= 0);
alter table public.orders add column if not exists discount_amount bigint not null default 0 check (discount_amount >= 0);
alter table public.order_items add column if not exists discount_amount bigint not null default 0 check (discount_amount >= 0);
create index if not exists orders_promotion_idx on public.orders (promotion_id) where promotion_id is not null;

-- line_total_amount = precio base de la línea - descuento (sin descuento es igual que antes).
alter table public.order_items drop constraint if exists order_items_check;
alter table public.order_items add constraint order_items_check check (line_total_amount = unit_price_amount * quantity - discount_amount);

-- ---------------------------------------------------------------------------------------------------------------------------
-- Permisos: lectura para quien gestiona la organización (incluye soporte de plataforma). Las escrituras solo por las funciones de abajo.
-- ---------------------------------------------------------------------------------------------------------------------------

alter table public.promotions enable row level security;
alter table public.promotion_events enable row level security;
alter table public.promotion_ticket_types enable row level security;
alter table public.promotion_redemptions enable row level security;

drop policy if exists promotions_select on public.promotions;
create policy promotions_select on public.promotions for select to authenticated using ((select public.can_manage_org(organization_id)));
drop policy if exists promotion_events_select on public.promotion_events;
create policy promotion_events_select on public.promotion_events for select to authenticated
  using (exists (select 1 from public.promotions p where p.id = promotion_id and (select public.can_manage_org(p.organization_id))));
drop policy if exists promotion_ticket_types_select on public.promotion_ticket_types;
create policy promotion_ticket_types_select on public.promotion_ticket_types for select to authenticated
  using (exists (select 1 from public.promotions p where p.id = promotion_id and (select public.can_manage_org(p.organization_id))));
drop policy if exists promotion_redemptions_select on public.promotion_redemptions;
create policy promotion_redemptions_select on public.promotion_redemptions for select to authenticated using ((select public.can_manage_org(organization_id)));

grant select on public.promotions, public.promotion_events, public.promotion_ticket_types, public.promotion_redemptions to authenticated;
grant all on public.promotions, public.promotion_events, public.promotion_ticket_types, public.promotion_redemptions to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Motor de cálculo (solo servidor)
-- ---------------------------------------------------------------------------------------------------------------------------

create or replace function public.normalize_promotion_code(raw text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(trim(coalesce(raw, '')), '\s+', '', 'g'));
$$;

-- Líneas de una selección (todavía sin orden): [{item_id, item_type, quantity, unit_price}] con los precios REALES de la base.
create or replace function public.build_promotion_lines(target_event uuid, selections jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lines jsonb := '[]'::jsonb; selection jsonb; kind text; item uuid; qty integer; price bigint;
begin
  if jsonb_typeof(selections) <> 'array' then return lines; end if;
  for selection in select value from jsonb_array_elements(selections) loop
    begin
      kind := coalesce(selection->>'item_type', case when selection ? 'ticket_type_id' then 'ticket' else null end);
      item := coalesce(selection->>'item_id', selection->>'ticket_type_id')::uuid;
      qty := (selection->>'quantity')::integer;
    exception when others then
      continue;
    end;
    price := null;
    if kind = 'ticket' then
      select price_amount into price from public.ticket_types where id = item and event_id = target_event and active;
    elsif kind = 'table' then
      select base_price_amount into price from public.event_tables where id = item and event_id = target_event and active;
    elsif kind = 'seat' then
      select s.base_price_amount into price from public.event_seats e join public.seat_map_sections s on s.id = e.section_id
      where e.id = item and e.event_id = target_event and e.active;
    end if;
    if price is not null and qty >= 1 then
      lines := lines || jsonb_build_array(jsonb_build_object('item_id', item, 'item_type', kind, 'quantity', qty, 'unit_price', price));
    end if;
  end loop;
  return lines;
end;
$$;

-- Usos vigentes: confirmados + reservas que todavía no vencieron. Los reembolsados y liberados no cuentan.
create or replace function public.promotion_usage(target_promotion uuid, target_email text default null)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.promotion_redemptions r
  join public.orders o on o.id = r.order_id
  where r.promotion_id = target_promotion
    and (target_email is null or r.buyer_email = lower(trim(target_email)))
    and (r.status = 'confirmed' or (r.status = 'reserved' and o.status = 'pending' and o.expires_at > now()));
$$;

-- Evalúa un código contra las líneas de una compra. Con lock_row = true bloquea la promoción (para que dos compras simultáneas
-- no puedan gastar el último uso). Devuelve {valid: false, error} o {valid: true, discount_amount, line_discounts, ...}.
create or replace function public.evaluate_promotion(target_event uuid, target_code text, lines jsonb, buyer_email text, lock_row boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event_org uuid; promo public.promotions; normalized text := public.normalize_promotion_code(target_code);
  eligible_qty integer; total_qty integer; list_ticket_subtotal bigint; computed jsonb; min_required integer; discount_total bigint;
begin
  select organization_id into event_org from public.events where id = target_event;
  if event_org is null or normalized = '' then return jsonb_build_object('valid', false, 'error', 'CODE_NOT_FOUND'); end if;

  if lock_row then
    select * into promo from public.promotions where organization_id = event_org and code = normalized for update;
  else
    select * into promo from public.promotions where organization_id = event_org and code = normalized;
  end if;
  if not found then return jsonb_build_object('valid', false, 'error', 'CODE_NOT_FOUND'); end if;

  if not promo.active then return jsonb_build_object('valid', false, 'error', 'CODE_INACTIVE'); end if;
  if promo.starts_at is not null and promo.starts_at > now() then return jsonb_build_object('valid', false, 'error', 'CODE_NOT_STARTED'); end if;
  if promo.ends_at is not null and promo.ends_at <= now() then return jsonb_build_object('valid', false, 'error', 'CODE_EXPIRED'); end if;
  if not (promo.all_events or exists (select 1 from public.promotion_events pe where pe.promotion_id = promo.id and pe.event_id = target_event)) then
    return jsonb_build_object('valid', false, 'error', 'CODE_WRONG_EVENT');
  end if;

  with ticket_lines as (
    select (l->>'item_id')::uuid as item_id, (l->>'quantity')::integer as qty, (l->>'unit_price')::bigint as price
    from jsonb_array_elements(lines) l where l->>'item_type' = 'ticket'
  ), eligible as (
    select * from ticket_lines t where
      not exists (select 1 from public.promotion_ticket_types pt where pt.promotion_id = promo.id)
      or exists (select 1 from public.promotion_ticket_types pt where pt.promotion_id = promo.id and pt.ticket_type_id = t.item_id)
  )
  select coalesce((select sum(qty) from eligible), 0), coalesce((select sum(x.quantity) from jsonb_to_recordset(lines) as x(quantity integer)), 0),
         coalesce((select sum(qty * price) from eligible), 0)
  into eligible_qty, total_qty, list_ticket_subtotal;

  if eligible_qty = 0 then return jsonb_build_object('valid', false, 'error', 'CODE_NOT_APPLICABLE'); end if;
  min_required := greatest(promo.min_tickets, case when promo.kind = 'two_for_one' then 2 else 1 end);
  if eligible_qty < min_required then return jsonb_build_object('valid', false, 'error', 'CODE_MIN_TICKETS', 'min', min_required); end if;

  if promo.max_total_uses is not null and public.promotion_usage(promo.id) >= promo.max_total_uses then
    return jsonb_build_object('valid', false, 'error', 'CODE_EXHAUSTED');
  end if;
  if promo.max_uses_per_buyer is not null and public.promotion_usage(promo.id, buyer_email) >= promo.max_uses_per_buyer then
    return jsonb_build_object('valid', false, 'error', 'CODE_BUYER_LIMIT');
  end if;

  -- Cupón 100%: toda la compra tiene que ser de entradas elegibles y entrar en el máximo (se emite como cortesía).
  if promo.kind = 'free' then
    if eligible_qty <> total_qty then return jsonb_build_object('valid', false, 'error', 'CODE_FREE_ONLY_ELIGIBLE'); end if;
    if eligible_qty > promo.max_tickets_benefited then return jsonb_build_object('valid', false, 'error', 'CODE_FREE_LIMIT', 'max', promo.max_tickets_benefited); end if;
  end if;

  -- Cada unidad elegible, de la más cara a la más barata; el tope de entradas beneficiadas y el de monto se aplican en ese orden.
  with eligible as (
    select (l->>'item_id')::uuid as item_id, (l->>'quantity')::integer as qty, (l->>'unit_price')::bigint as price
    from jsonb_array_elements(lines) l
    where l->>'item_type' = 'ticket' and (
      not exists (select 1 from public.promotion_ticket_types pt where pt.promotion_id = promo.id)
      or exists (select 1 from public.promotion_ticket_types pt where pt.promotion_id = promo.id and pt.ticket_type_id = (l->>'item_id')::uuid))
  ), units as (
    select e.item_id, e.price, row_number() over (order by e.price desc, e.item_id, g) as rn
    from eligible e cross join lateral generate_series(1, e.qty) g
  ), raw as (
    select item_id, price, rn,
      case promo.kind
        when 'percent' then least(price, round(price * promo.percent_bps::numeric / 10000)::bigint)
        when 'fixed' then least(price, promo.fixed_amount)
        when 'special_price' then greatest(price - promo.special_price_amount, 0)
        when 'free' then price
        when 'two_for_one' then case when rn % 2 = 0 then price else 0 end
      end as unit_discount,
      case when promo.kind = 'two_for_one' then (rn % 2 = 0 and (promo.max_tickets_benefited is null or rn / 2 <= promo.max_tickets_benefited))
           else (promo.max_tickets_benefited is null or rn <= promo.max_tickets_benefited) end as within_limit
    from units
  ), capped as (
    select item_id, rn, case when within_limit then unit_discount else 0 end as d from raw
  ), running as (
    select item_id, rn, d, coalesce(sum(d) over (order by rn rows between unbounded preceding and 1 preceding), 0) as prior from capped
  ), final as (
    select item_id,
      case when promo.max_discount_amount is null then d else least(d, greatest(promo.max_discount_amount - prior, 0)) end as applied
    from running
  ), by_item as (
    select item_id, sum(applied)::bigint as discount, count(*) filter (where applied > 0)::integer as benefited from final group by item_id
  )
  select jsonb_build_object(
      'discount_amount', coalesce(sum(discount), 0),
      'tickets_benefited', coalesce(sum(benefited), 0),
      'line_discounts', coalesce(jsonb_agg(jsonb_build_object('item_id', item_id, 'discount', discount)) filter (where discount > 0), '[]'::jsonb))
  into computed from by_item;

  discount_total := (computed->>'discount_amount')::bigint;
  if discount_total <= 0 then return jsonb_build_object('valid', false, 'error', 'CODE_NO_DISCOUNT'); end if;

  return jsonb_build_object(
    'valid', true, 'promotion_id', promo.id, 'code', promo.code, 'name', promo.name, 'kind', promo.kind,
    'courtesy', promo.kind = 'free', 'list_ticket_subtotal', list_ticket_subtotal,
    'discount_amount', discount_total, 'tickets_benefited', (computed->>'tickets_benefited')::integer,
    'line_discounts', computed->'line_discounts');
end;
$$;

-- Vista previa para el checkout (no reserva nada). El servidor la llama con el email de la cuenta del comprador.
create or replace function public.preview_promotion(target_event uuid, target_code text, selections jsonb, buyer_email text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.evaluate_promotion(target_event, target_code, public.build_promotion_lines(target_event, selections), buyer_email, false);
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Reserva con cupón: crea la orden con la función de siempre (cargo sobre el precio base) y aplica el descuento en la misma transacción.
-- ---------------------------------------------------------------------------------------------------------------------------

create or replace function public.create_guest_checkout_promoted(
  target_event uuid, buyer_first_name text, buyer_last_name text, buyer_email text, buyer_phone text, buyer_document text,
  selections jsonb, target_attribution_session_hash text, accepted_terms_document_id uuid, accepted_refund_policy_document_id uuid,
  target_promotion_code text)
returns table (order_public_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  created record; order_row public.orders; lines jsonb; evaluation jsonb; discount bigint; final_subtotal bigint; final_fee bigint;
  courtesy boolean; normalized_email text := lower(trim(buyer_email));
begin
  select c.order_public_id, c.expires_at into created
  from public.create_guest_checkout_attributed(target_event, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, buyer_document,
    selections, target_attribution_session_hash, accepted_terms_document_id, accepted_refund_policy_document_id) c;

  select * into order_row from public.orders where public_id = created.order_public_id for update;
  select jsonb_agg(jsonb_build_object(
    'item_id', coalesce(oi.ticket_type_id, oi.event_table_id, oi.event_seat_id), 'item_type', oi.item_type::text,
    'quantity', oi.quantity, 'unit_price', oi.unit_price_amount)) into lines
  from public.order_items oi where oi.order_id = order_row.id;

  evaluation := public.evaluate_promotion(target_event, target_promotion_code, coalesce(lines, '[]'::jsonb), normalized_email, true);
  if (evaluation->>'valid')::boolean is not true then
    raise exception '%', evaluation->>'error' using errcode = 'P0001'; -- deshace toda la reserva
  end if;

  discount := (evaluation->>'discount_amount')::bigint;
  courtesy := (evaluation->>'courtesy')::boolean;
  final_subtotal := order_row.subtotal_amount - discount;
  final_fee := case when courtesy then 0 else order_row.service_fee_amount end; -- el cargo NO se toca, salvo cortesía

  update public.order_items oi
  set discount_amount = d.discount, line_total_amount = oi.unit_price_amount * oi.quantity - d.discount
  from jsonb_to_recordset(evaluation->'line_discounts') as d(item_id uuid, discount bigint)
  where oi.order_id = order_row.id and oi.ticket_type_id = d.item_id;

  update public.orders
  set list_subtotal_amount = order_row.subtotal_amount, discount_amount = discount, promotion_id = (evaluation->>'promotion_id')::uuid,
      subtotal_amount = final_subtotal, service_fee_amount = final_fee, total_amount = final_subtotal + final_fee,
      is_courtesy = is_courtesy or courtesy
  where id = order_row.id;

  insert into public.promotion_redemptions (promotion_id, organization_id, event_id, order_id, buyer_email, tickets_benefited, list_subtotal_amount, discount_amount)
  values ((evaluation->>'promotion_id')::uuid, order_row.organization_id, order_row.event_id, order_row.id, normalized_email,
    (evaluation->>'tickets_benefited')::integer, order_row.subtotal_amount, discount);

  return query select created.order_public_id, created.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Ciclo de vida del uso según el estado de la orden (no se modifican las funciones de pago)
-- ---------------------------------------------------------------------------------------------------------------------------

create or replace function public.sync_promotion_redemption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.promotion_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'paid' then
    update public.promotion_redemptions set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
    where order_id = new.id and status in ('reserved', 'released');
  elsif new.status in ('expired', 'cancelled') then
    update public.promotion_redemptions set status = 'released', released_at = now(), release_reason = new.status::text
    where order_id = new.id and status = 'reserved';
  elsif new.status = 'refunded' then
    update public.promotion_redemptions set status = 'refunded', refunded_at = now()
    where order_id = new.id and status = 'confirmed';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_sync_promotion_redemption on public.orders;
create trigger orders_sync_promotion_redemption after update of status on public.orders
  for each row execute function public.sync_promotion_redemption();

-- ---------------------------------------------------------------------------------------------------------------------------
-- Administración (panel del productor). Todo queda en audit_logs.
-- ---------------------------------------------------------------------------------------------------------------------------

create or replace function public.upsert_promotion(
  target_org uuid, target_id uuid, target_name text, target_code text, target_description text, target_kind text,
  target_percent_bps integer, target_fixed_amount bigint, target_special_price_amount bigint, target_active boolean,
  target_all_events boolean, target_event_ids uuid[], target_ticket_type_ids uuid[],
  target_starts_at timestamptz, target_ends_at timestamptz, target_max_total_uses integer, target_max_uses_per_buyer integer,
  target_max_tickets_benefited integer, target_min_tickets integer, target_max_discount_amount bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare promo_id uuid; normalized text := public.normalize_promotion_code(target_code); before_row jsonb; has_uses boolean;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  if normalized !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'INVALID_CODE' using errcode = 'P0001'; end if;
  if coalesce(target_all_events, false) = false and coalesce(array_length(target_event_ids, 1), 0) = 0 then
    raise exception 'EVENT_REQUIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(target_event_ids, '{}')) e where not exists (select 1 from public.events ev where ev.id = e and ev.organization_id = target_org)) then
    raise exception 'EVENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_ticket_type_ids, '{}')) t
    where not exists (select 1 from public.ticket_types tt where tt.id = t and tt.organization_id = target_org
      and (coalesce(target_all_events, false) or tt.event_id = any (coalesce(target_event_ids, '{}'))))
  ) then
    raise exception 'TICKET_TYPE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if target_id is null then
    begin
      insert into public.promotions (organization_id, name, code, description, kind, percent_bps, fixed_amount, special_price_amount, active, all_events,
        starts_at, ends_at, max_total_uses, max_uses_per_buyer, max_tickets_benefited, min_tickets, max_discount_amount, created_by)
      values (target_org, trim(target_name), normalized, nullif(trim(coalesce(target_description, '')), ''), target_kind,
        case when target_kind = 'percent' then target_percent_bps end, case when target_kind = 'fixed' then target_fixed_amount end,
        case when target_kind = 'special_price' then target_special_price_amount end, coalesce(target_active, true), coalesce(target_all_events, false),
        target_starts_at, target_ends_at, target_max_total_uses, target_max_uses_per_buyer, target_max_tickets_benefited,
        greatest(coalesce(target_min_tickets, 1), 1), target_max_discount_amount, auth.uid())
      returning id into promo_id;
    exception
      when unique_violation then raise exception 'CODE_TAKEN' using errcode = 'P0001';
      when check_violation then raise exception 'INVALID_PROMOTION' using errcode = 'P0001';
    end;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (target_org, auth.uid(), 'promotion.created', 'promotion', promo_id, jsonb_build_object('code', normalized, 'kind', target_kind));
  else
    select to_jsonb(p) into before_row from public.promotions p where p.id = target_id and p.organization_id = target_org;
    if before_row is null then raise exception 'PROMOTION_NOT_FOUND' using errcode = 'P0001'; end if;
    select exists (select 1 from public.promotion_redemptions where promotion_id = target_id) into has_uses;
    if has_uses and normalized <> before_row->>'code' then raise exception 'CODE_LOCKED' using errcode = 'P0001'; end if;
    begin
      update public.promotions set name = trim(target_name), code = normalized, description = nullif(trim(coalesce(target_description, '')), ''),
        kind = target_kind, percent_bps = case when target_kind = 'percent' then target_percent_bps end,
        fixed_amount = case when target_kind = 'fixed' then target_fixed_amount end,
        special_price_amount = case when target_kind = 'special_price' then target_special_price_amount end,
        active = coalesce(target_active, true), all_events = coalesce(target_all_events, false), starts_at = target_starts_at, ends_at = target_ends_at,
        max_total_uses = target_max_total_uses, max_uses_per_buyer = target_max_uses_per_buyer, max_tickets_benefited = target_max_tickets_benefited,
        min_tickets = greatest(coalesce(target_min_tickets, 1), 1), max_discount_amount = target_max_discount_amount, updated_at = now()
      where id = target_id and organization_id = target_org returning id into promo_id;
    exception
      when unique_violation then raise exception 'CODE_TAKEN' using errcode = 'P0001';
      when check_violation then raise exception 'INVALID_PROMOTION' using errcode = 'P0001';
    end;
    insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (target_org, auth.uid(), 'promotion.updated', 'promotion', promo_id, before_row,
      (select to_jsonb(p) from public.promotions p where p.id = promo_id));
  end if;

  delete from public.promotion_events where promotion_id = promo_id;
  insert into public.promotion_events (promotion_id, event_id)
  select promo_id, e from unnest(coalesce(target_event_ids, '{}')) e on conflict do nothing;
  delete from public.promotion_ticket_types where promotion_id = promo_id;
  insert into public.promotion_ticket_types (promotion_id, ticket_type_id)
  select promo_id, t from unnest(coalesce(target_ticket_type_ids, '{}')) t on conflict do nothing;
  return promo_id;
end;
$$;

create or replace function public.set_promotion_active(target_org uuid, target_id uuid, target_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  update public.promotions set active = target_active, updated_at = now() where id = target_id and organization_id = target_org;
  if not found then raise exception 'PROMOTION_NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), case when target_active then 'promotion.activated' else 'promotion.deactivated' end, 'promotion', target_id, jsonb_build_object('active', target_active));
end;
$$;

-- Copia la promoción (queda inactiva) con un código libre: CODIGO-2, CODIGO-3...
create or replace function public.duplicate_promotion(target_org uuid, target_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.promotions; new_id uuid; base text; suffix integer := 2; candidate text;
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  select * into source from public.promotions where id = target_id and organization_id = target_org;
  if not found then raise exception 'PROMOTION_NOT_FOUND' using errcode = 'P0001'; end if;
  base := regexp_replace(source.code, '-[0-9]+$', ''); -- ELIAS20 -> ELIAS20-2, ELIAS20-2 -> ELIAS20-3
  loop
    candidate := left(base, 30 - length(suffix::text) - 1) || '-' || suffix::text;
    exit when not exists (select 1 from public.promotions where organization_id = target_org and code = candidate);
    suffix := suffix + 1;
  end loop;
  insert into public.promotions (organization_id, name, code, description, kind, percent_bps, fixed_amount, special_price_amount, active, all_events, starts_at, ends_at,
    max_total_uses, max_uses_per_buyer, max_tickets_benefited, min_tickets, max_discount_amount, channels, created_by)
  values (target_org, left(source.name || ' (copia)', 80), candidate, source.description, source.kind, source.percent_bps, source.fixed_amount, source.special_price_amount,
    false, source.all_events, source.starts_at, source.ends_at, source.max_total_uses, source.max_uses_per_buyer, source.max_tickets_benefited, source.min_tickets,
    source.max_discount_amount, source.channels, auth.uid())
  returning id into new_id;
  insert into public.promotion_events (promotion_id, event_id) select new_id, event_id from public.promotion_events where promotion_id = source.id;
  insert into public.promotion_ticket_types (promotion_id, ticket_type_id) select new_id, ticket_type_id from public.promotion_ticket_types where promotion_id = source.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (target_org, auth.uid(), 'promotion.duplicated', 'promotion', new_id, jsonb_build_object('from', source.id, 'code', candidate));
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Estadísticas e historial (solo ventas confirmadas cuentan como ventas; reservas y reembolsos se muestran aparte)
-- ---------------------------------------------------------------------------------------------------------------------------

create or replace function public.get_promotions_overview(target_org uuid, target_event uuid default null, target_from timestamptz default null, target_to timestamptz default null)
returns table (
  id uuid, code text, name text, kind text, percent_bps integer, fixed_amount bigint, special_price_amount bigint, active boolean, all_events boolean,
  starts_at timestamptz, ends_at timestamptz, max_total_uses integer, max_uses_per_buyer integer, max_tickets_benefited integer, min_tickets integer,
  max_discount_amount bigint, created_at timestamptz, status text,
  uses_confirmed integer, uses_pending integer, uses_refunded integer, tickets_benefited integer, discount_amount bigint, sales_amount bigint, buyers integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select p.id, p.code, p.name, p.kind, p.percent_bps, p.fixed_amount, p.special_price_amount, p.active, p.all_events,
    p.starts_at, p.ends_at, p.max_total_uses, p.max_uses_per_buyer, p.max_tickets_benefited, p.min_tickets, p.max_discount_amount, p.created_at,
    case when not p.active then 'inactive'
         when p.ends_at is not null and p.ends_at <= now() then 'expired'
         when p.starts_at is not null and p.starts_at > now() then 'scheduled'
         when p.max_total_uses is not null and public.promotion_usage(p.id) >= p.max_total_uses then 'exhausted'
         else 'active' end,
    coalesce(count(r.id) filter (where r.status = 'confirmed'), 0)::integer,
    coalesce(count(r.id) filter (where r.status = 'reserved' and o.status = 'pending' and o.expires_at > now()), 0)::integer,
    coalesce(count(r.id) filter (where r.status = 'refunded'), 0)::integer,
    coalesce(sum(r.tickets_benefited) filter (where r.status = 'confirmed'), 0)::integer,
    coalesce(sum(r.discount_amount) filter (where r.status = 'confirmed'), 0)::bigint,
    coalesce(sum(o.subtotal_amount) filter (where r.status = 'confirmed'), 0)::bigint,
    coalesce(count(distinct r.buyer_email) filter (where r.status = 'confirmed'), 0)::integer
  from public.promotions p
  left join public.promotion_redemptions r on r.promotion_id = p.id
    and (target_event is null or r.event_id = target_event)
    and (target_from is null or r.created_at >= target_from) and (target_to is null or r.created_at < target_to)
  left join public.orders o on o.id = r.order_id
  where p.organization_id = target_org
    and (target_event is null or p.all_events or exists (select 1 from public.promotion_events pe where pe.promotion_id = p.id and pe.event_id = target_event))
  group by p.id
  order by p.active desc, p.created_at desc;
end;
$$;

create or replace function public.get_promotions_summary(target_org uuid, target_event uuid default null, target_from timestamptz default null, target_to timestamptz default null)
returns table (active_promotions integer, uses_confirmed integer, tickets_benefited integer, discount_amount bigint, sales_amount bigint, buyers integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select
    (select count(*)::integer from public.promotions p where p.organization_id = target_org and p.active
      and (p.ends_at is null or p.ends_at > now()) and (p.starts_at is null or p.starts_at <= now())),
    coalesce(count(r.id), 0)::integer, coalesce(sum(r.tickets_benefited), 0)::integer, coalesce(sum(r.discount_amount), 0)::bigint,
    coalesce(sum(o.subtotal_amount), 0)::bigint, coalesce(count(distinct r.buyer_email), 0)::integer
  from public.promotion_redemptions r join public.orders o on o.id = r.order_id
  where r.organization_id = target_org and r.status = 'confirmed'
    and (target_event is null or r.event_id = target_event)
    and (target_from is null or r.created_at >= target_from) and (target_to is null or r.created_at < target_to);
end;
$$;

create or replace function public.get_promotion_timeline(target_org uuid, target_promotion uuid)
returns table (day date, uses integer, discount_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select (r.confirmed_at at time zone 'America/Argentina/Mendoza')::date, count(*)::integer, sum(r.discount_amount)::bigint
  from public.promotion_redemptions r
  where r.organization_id = target_org and r.promotion_id = target_promotion and r.status = 'confirmed' and r.confirmed_at is not null
  group by 1 order by 1;
end;
$$;

create or replace function public.list_promotion_redemptions(target_org uuid, target_promotion uuid default null, target_status text default null, target_limit integer default 200)
returns table (
  redemption_id uuid, created_at timestamptz, status text, code text, order_public_id text, event_name text, buyer_email text, buyer_name text,
  tickets_benefited integer, list_subtotal_amount bigint, discount_amount bigint, order_total_amount bigint, payment_reference text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_org(target_org) then raise exception 'NOT_ALLOWED' using errcode = 'P0001'; end if;
  return query
  select r.id, r.created_at, r.status, p.code, o.public_id, e.name, r.buyer_email, trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
    r.tickets_benefited, r.list_subtotal_amount, r.discount_amount, o.total_amount,
    (select pay.provider_payment_id from public.payments pay where pay.order_id = o.id and pay.provider_payment_id is not null order by pay.created_at desc limit 1)
  from public.promotion_redemptions r
  join public.promotions p on p.id = r.promotion_id
  join public.orders o on o.id = r.order_id
  join public.events e on e.id = r.event_id
  left join public.customers c on c.id = o.customer_id
  where r.organization_id = target_org
    and (target_promotion is null or r.promotion_id = target_promotion)
    and (target_status is null or r.status = target_status)
  order by r.created_at desc
  limit greatest(least(coalesce(target_limit, 200), 5000), 1);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------------------------------------

-- Solo el servidor (service_role): motor, vista previa y reserva con cupón.
revoke all on function public.normalize_promotion_code(text) from public, anon, authenticated;
revoke all on function public.build_promotion_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.promotion_usage(uuid, text) from public, anon, authenticated;
revoke all on function public.evaluate_promotion(uuid, text, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.preview_promotion(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_guest_checkout_promoted(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sync_promotion_redemption() from public, anon, authenticated;
grant execute on function public.normalize_promotion_code(text) to service_role;
grant execute on function public.build_promotion_lines(uuid, jsonb) to service_role;
grant execute on function public.promotion_usage(uuid, text) to service_role;
grant execute on function public.evaluate_promotion(uuid, text, jsonb, text, boolean) to service_role;
grant execute on function public.preview_promotion(uuid, text, jsonb, text) to service_role;
grant execute on function public.create_guest_checkout_promoted(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, text) to service_role;

-- Panel del productor (usuarios con sesión; cada función valida que gestione la organización).
revoke all on function public.upsert_promotion(uuid, uuid, text, text, text, text, integer, bigint, bigint, boolean, boolean, uuid[], uuid[], timestamptz, timestamptz, integer, integer, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.set_promotion_active(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_promotion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_promotions_overview(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.get_promotions_summary(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.get_promotion_timeline(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_promotion_redemptions(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.upsert_promotion(uuid, uuid, text, text, text, text, integer, bigint, bigint, boolean, boolean, uuid[], uuid[], timestamptz, timestamptz, integer, integer, integer, integer, bigint) to authenticated;
grant execute on function public.set_promotion_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.duplicate_promotion(uuid, uuid) to authenticated;
grant execute on function public.get_promotions_overview(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_promotions_summary(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_promotion_timeline(uuid, uuid) to authenticated;
grant execute on function public.list_promotion_redemptions(uuid, uuid, text, integer) to authenticated;

-- La página pública de la orden muestra el descuento de cada línea (misma función de siempre, una clave más en el detalle de ítems).
CREATE OR REPLACE FUNCTION public.get_public_order(target_public_id text)
 RETURNS TABLE(public_id text, event_name text, event_slug text, event_cover_url text, status order_status, subtotal_amount bigint, service_fee_amount bigint, total_amount bigint, currency character, expires_at timestamp with time zone, items jsonb, payment_public_id text, payment_status payment_status, payment_requires_action boolean, payment_updated_at timestamp with time zone, payment_account_connected boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_order_id uuid;
begin
  select o.id into target_order_id from public.orders o
  where o.public_id = target_public_id for update;
  if not found then return; end if;
  update public.ticket_holds h set status = 'expired'
  where h.order_id = target_order_id and h.status = 'active' and h.expires_at <= now();
  update public.table_holds h set status = 'expired'
  where h.order_id = target_order_id and h.status = 'active' and h.expires_at <= now();
  update public.orders o set status = 'expired'
  where o.id = target_order_id and o.status = 'pending' and o.expires_at <= now();
  return query
  select o.public_id, e.name, e.slug, e.cover_image_url, o.status,
    o.subtotal_amount, o.service_fee_amount, o.total_amount, o.currency, o.expires_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', i.item_name,
      'quantity', i.quantity,
      'unit_price_amount', i.unit_price_amount,
      'discount_amount', i.discount_amount,
      'item_type', i.item_type,
      'event_table_id', i.event_table_id
    ) order by i.created_at), '[]'::jsonb),
    latest_payment.public_id, latest_payment.status,
    coalesce(latest_payment.requires_action, false), latest_payment.updated_at,
    exists (
      select 1 from public.payment_accounts a
      where a.organization_id = o.organization_id
        and a.provider = 'mercado_pago' and a.status = 'connected'
    )
  from public.orders o
  join public.events e on e.id = o.event_id
  join public.order_items i on i.order_id = o.id
  left join lateral (
    select p.public_id, p.status, p.requires_action, p.updated_at
    from public.payments p where p.order_id = o.id
    order by p.created_at desc limit 1
  ) latest_payment on true
  where o.id = target_order_id
  group by o.id, e.name, e.slug, e.cover_image_url,
    latest_payment.public_id, latest_payment.status,
    latest_payment.requires_action, latest_payment.updated_at;
end;
$function$;

notify pgrst, 'reload schema';
