-- Duplicar evento ahora copia también lo que se agregó después de la función original:
-- categoría del evento y mapa de asientos activado, hora límite de ingreso y entradas "solo con link" (con link nuevo),
-- y la configuración de taquilla con sus precios. Un boliche repite cada fin de semana: la copia debe quedar lista para editar la fecha y publicar.
-- Los scanners no se copian (el PIN es de una noche) y la puerta "Acceso principal" la crea sola el sistema al copiar las entradas.

alter function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean)
rename to duplicate_event_phase_6;

create function public.duplicate_event_with_options(
  target_event uuid, target_name text, target_slug text, target_starts_at timestamptz,
  preserve_tickets boolean, preserve_promoters boolean, preserve_tables boolean,
  preserve_products boolean, preserve_sales_locations boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  source_event public.events;
  new_event_id uuid;
  date_delta interval;
begin
  select * into source_event from public.events where id = target_event;
  if not found or auth.uid() is null or not public.can_manage_org(source_event.organization_id) then
    raise exception 'NOT_ALLOWED' using errcode = 'P0001';
  end if;
  new_event_id := public.duplicate_event_phase_6(
    target_event, target_name, target_slug, target_starts_at,
    preserve_tickets, preserve_promoters, preserve_tables, preserve_products, preserve_sales_locations
  );
  date_delta := target_starts_at - source_event.starts_at;

  update public.events set
    discovery_category = source_event.discovery_category,
    seatmap_enabled = source_event.seatmap_enabled
  where id = new_event_id;

  if preserve_tickets then
    -- Los nombres de entrada son únicos dentro del evento: sirven para emparejar origen y copia.
    -- link_only y link_token van juntos (constraint) y el link es nuevo: el de la fecha anterior no debe abrir la nueva.
    update public.ticket_types copy
    set entry_cutoff_time = source.entry_cutoff_time,
        link_only = source.link_only,
        link_token = case when source.link_only then encode(extensions.gen_random_bytes(16), 'hex') else null end
    from public.ticket_types source
    where source.event_id = target_event and copy.event_id = new_event_id and copy.name = source.name;

    insert into public.event_box_office_settings (
      event_id, organization_id, enabled, cash_enabled, qr_enabled, debit_enabled, credit_enabled,
      transfer_enabled, other_enabled, allow_after_start, closes_at, mp_qr_enabled, qr_expiry_minutes
    )
    select new_event_id, organization_id, enabled, cash_enabled, qr_enabled, debit_enabled, credit_enabled,
      transfer_enabled, other_enabled, allow_after_start,
      case when closes_at is null then null else closes_at + date_delta end, mp_qr_enabled, qr_expiry_minutes
    from public.event_box_office_settings where event_id = target_event;

    insert into public.ticket_type_channel_prices (ticket_type_id, channel, organization_id, event_id, price_amount, enabled)
    select copy.id, price.channel, price.organization_id, new_event_id, price.price_amount, price.enabled
    from public.ticket_type_channel_prices price
    join public.ticket_types source on source.id = price.ticket_type_id
    join public.ticket_types copy on copy.event_id = new_event_id and copy.name = source.name
    where price.event_id = target_event;
  end if;
  return new_event_id;
end;
$$;

revoke all on function public.duplicate_event_phase_6(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.duplicate_event_with_options(uuid, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean) to authenticated;
