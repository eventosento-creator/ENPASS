begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

-- Ninguna función de gestión del club (escritura/reportes) puede ser ejecutable sin sesión.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'create_membership', 'create_membership_due', 'create_division_due', 'enroll_membership_in_division', 'remove_membership_from_division',
     'set_membership_status', 'approve_club_membership_request', 'reject_club_membership_request', 'upsert_membership_category', 'delete_membership_category',
     'upsert_division', 'delete_division', 'set_division_category', 'generate_dues_for_period', 'generate_division_dues_for_period',
     'record_manual_due_payment', 'record_manual_division_due_payment', 'upsert_membership_plan', 'delete_membership_plan', 'set_membership_plan',
     'get_club_report', 'get_club_settlements', 'club_permission', 'set_club_staff_role', 'list_club_team', 'create_club_staff_invitation')
   and has_function_privilege('anon', p.oid, 'execute')),
  '', 'las funciones de gestión del club no se pueden ejecutar sin sesión');

select * from finish();
rollback;
