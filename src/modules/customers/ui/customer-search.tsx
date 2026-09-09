"use client";

import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMoney } from "@/shared/lib/format";

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  totalSpent: number;
  currency: string;
  orderCount: number;
  eventCount: number;
  lastPurchaseAt: string | null;
};

export function CustomerSearch({ customers, totalRevenue }: { customers: CustomerRow[]; totalRevenue: number }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) => customer.name.toLowerCase().includes(normalized) || customer.email.toLowerCase().includes(normalized) || customer.phone?.toLowerCase().includes(normalized));
  }, [customers, query]);

  return <div className="mt-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Clientes</p><p className="mt-2 text-2xl font-black">{customers.length}</p></div>
      <div className="card p-5"><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Facturación total</p><p className="mt-2 text-2xl font-black">{formatMoney(totalRevenue, customers[0]?.currency ?? "ARS")}</p></div>
    </div>
    <label className="field mt-6 flex items-center gap-2.5 px-4"><Search size={16} className="shrink-0 text-neutral-500"/><input className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" placeholder="Buscar por nombre, email o teléfono" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <p className="mt-3 text-xs font-bold text-neutral-500">{filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}{query && ` de ${customers.length}`}</p>
    <div className="mt-4 card overflow-hidden">
      {filtered.length ? <div className="divide-y divide-white/[.06]">{filtered.map((customer) => <Link href={`/app/clientes/${customer.id}` as never} key={customer.id} className="flex items-center justify-between gap-4 p-4 transition hover:bg-white/[.03] sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
        <div className="min-w-0"><p className="truncate font-bold">{customer.name}</p><p className="mt-0.5 truncate text-xs text-neutral-500">{customer.email}</p></div>
        <div className="hidden text-right sm:block"><p className="text-sm font-black">{formatMoney(customer.totalSpent, customer.currency)}</p><p className="text-[11px] text-neutral-600">Gastado</p></div>
        <div className="hidden text-right sm:block"><p className="text-sm font-black">{customer.orderCount}</p><p className="text-[11px] text-neutral-600">{customer.orderCount === 1 ? "Compra" : "Compras"}</p></div>
        <div className="hidden text-right sm:block"><p className="text-sm font-black">{customer.eventCount}</p><p className="text-[11px] text-neutral-600">{customer.eventCount === 1 ? "Evento" : "Eventos"}</p></div>
        <ChevronRight size={16} className="shrink-0 text-neutral-600"/>
      </Link>)}</div> : <div className="p-10 text-center text-sm text-neutral-500">No encontramos clientes con esa búsqueda.</div>}
    </div>
  </div>;
}
