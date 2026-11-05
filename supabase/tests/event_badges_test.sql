begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role anon;
select is((select count(*) from public.get_event_ticket_counts('99999999-9999-4999-8999-99999999aaaa') where tickets_total > 0), 0::bigint, 'un evento inexistente no tiene cupo');
select ok((select tickets_total from public.get_event_ticket_counts(e.id)) > 0, 'el público ve el cupo total de un evento publicado') from public.events e where e.slug = 'sunset-club';
select ok((select tickets_sold from public.get_event_ticket_counts(e.id)) >= 0, 'y cuántas se vendieron') from public.events e where e.slug = 'sunset-club';
select ok((select count(*) from public.get_public_events_discovery() where tickets_total > 0) > 0, 'el listado público trae cupo y vendidas');

select * from finish();
rollback;
