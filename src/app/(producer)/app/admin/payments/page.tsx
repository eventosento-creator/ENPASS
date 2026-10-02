import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";
import { ReconcilePaymentForm } from "@/modules/organizations/ui/reconcile-payment-form";

export default async function AdminPaymentsPage() {
  if (!(await isPlatformAdmin())) notFound();
  return <>
    <header className="flex items-center gap-2"><ShieldCheck className="text-[var(--accent)]" size={22}/><h1 className="page-title">Reprocesar un pago</h1></header>
    <p className="mt-2 max-w-xl text-sm text-neutral-500">Si Mercado Pago cobró pero la venta no se registró, pegá el ID de la operación. Se consulta el pago directo a MP y se registra la orden, las entradas y el mail al comprador. Si ya estaba registrada, no se duplica nada.</p>
    <ReconcilePaymentForm/>
  </>;
}
