-- Cobro online de cuotas: permite insertar/actualizar filas de membership_due_payments desde
-- el service_role (server actions + webhook, mismo patrón que "payments" de la ticketera) y
-- agrega una lectura pública mínima para la pantalla de retorno de Mercado Pago (el socio no
-- tiene sesión en ENPASS).

grant insert, update on public.membership_due_payments to service_role;
grant update on public.membership_dues to service_role;

create function public.get_membership_due_public_status(target_due uuid)
returns table (
  organization_name text, member_first_name text, period date, amount bigint, currency text,
  status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select o.name, c.first_name, d.period, d.amount, o.default_currency,
    case when d.paid_at is not null then 'paid' else 'pending' end
  from public.membership_dues d
  join public.memberships m on m.id = d.membership_id
  join public.customers c on c.id = m.customer_id
  join public.organizations o on o.id = d.organization_id
  where d.id = target_due;
end;
$$;
revoke all on function public.get_membership_due_public_status(uuid) from public;
grant execute on function public.get_membership_due_public_status(uuid) to anon, authenticated;
