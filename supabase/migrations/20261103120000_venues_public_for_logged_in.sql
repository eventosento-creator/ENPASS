-- Un usuario con sesión iniciada no veía los eventos de otras organizaciones en /eventos (ni abría su página):
-- la política pública de lugares (venues_public_event_select) era solo para "anon", y para "authenticated" solo
-- quedaba la de miembros/colaboradores, así que el lugar del evento ajeno no se leía y el evento desaparecía del listado.
-- Se da a "authenticated" la misma lectura que ya tiene "anon": lugares de eventos publicados.
drop policy if exists venues_public_event_select_authenticated on public.venues;
create policy venues_public_event_select_authenticated on public.venues for select to authenticated
  using (exists (select 1 from public.events e where e.venue_id = public.venues.id and e.status = 'published'));
