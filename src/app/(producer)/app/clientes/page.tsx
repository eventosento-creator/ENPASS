import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { createClient } from "@/shared/database/server";
import { EmptyState } from "@/shared/ui/empty-state";
import { CustomerSearch, type CustomerRow } from "@/modules/customers/ui/customer-search";

export default async function ClientsPage() {
  const org = await getCurrentOrganization();
  if (!org) redirect("/app/onboarding");
  const supabase = await createClient();

  const [{ data: customers }, { data: orders }] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, email, phone, tags").eq("organization_id", org.id),
    supabase.from("orders").select("customer_id, event_id, total_amount, currency, created_at").eq("organization_id", org.id).eq("status", "paid"),
  ]);

  const ordersByCustomer = new Map<string, { total: number; currency: string; orderCount: number; events: Set<string>; lastPurchaseAt: string }>();
  for (const order of orders ?? []) {
    if (!order.customer_id) continue;
    const existing = ordersByCustomer.get(order.customer_id);
    if (existing) {
      existing.total += order.total_amount;
      existing.orderCount += 1;
      existing.events.add(order.event_id);
      if (order.created_at > existing.lastPurchaseAt) existing.lastPurchaseAt = order.created_at;
    } else {
      ordersByCustomer.set(order.customer_id, { total: order.total_amount, currency: order.currency, orderCount: 1, events: new Set([order.event_id]), lastPurchaseAt: order.created_at });
    }
  }

  const rows: CustomerRow[] = (customers ?? [])
    .map((customer) => {
      const stats = ordersByCustomer.get(customer.id);
      return {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`.trim() || "Sin nombre",
        email: customer.email,
        phone: customer.phone,
        tags: customer.tags,
        totalSpent: stats?.total ?? 0,
        currency: stats?.currency ?? "ARS",
        orderCount: stats?.orderCount ?? 0,
        eventCount: stats?.events.size ?? 0,
        lastPurchaseAt: stats?.lastPurchaseAt ?? null,
      };
    })
    .filter((customer) => customer.orderCount > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const totalRevenue = rows.reduce((sum, row) => sum + row.totalSpent, 0);

  return <>
    <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Tu organización</p><h1 className="page-title mt-2">Clientes</h1><p className="mt-3 text-neutral-500">Todos los compradores de tus eventos, en un solo lugar.</p></div></div>
    {rows.length ? <CustomerSearch customers={rows} totalRevenue={totalRevenue}/> : <div className="mt-8"><EmptyState icon={Users} title="Todavía no tenés clientes" description="Cuando alguien complete una compra en cualquiera de tus eventos, va a aparecer acá."/></div>}
  </>;
}
