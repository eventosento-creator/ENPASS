import { notFound } from "next/navigation";
import { CheckCircle2, Clock3 } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { formatMoney } from "@/shared/lib/format";
import { EnpassLogo } from "@/shared/ui/brand";

export default async function DuePaymentReturnPage({ params }: { params: Promise<{ dueId: string }> }) {
  const { dueId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_membership_due_public_status", { target_due: dueId });
  const due = data?.[0];
  if (!due) notFound();

  const paid = due.status === "paid";
  return <main className="grid min-h-dvh place-items-center px-4">
    <div className="card w-full max-w-sm p-8 text-center">
      <div className="flex justify-center"><EnpassLogo/></div>
      <div className={`mx-auto mt-7 grid size-16 place-items-center rounded-full ${paid ? "bg-lime-300/10 text-lime-300" : "bg-amber-300/10 text-amber-300"}`}>
        {paid ? <CheckCircle2 size={32}/> : <Clock3 size={32}/>}
      </div>
      <h1 className="mt-5 text-xl font-black">{paid ? "¡Cuota pagada!" : "Pago en proceso"}</h1>
      <p className="mt-2 text-sm text-neutral-500">{due.organization_name} · Cuota {new Date(`${due.period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</p>
      <p className="mt-4 text-2xl font-black">{formatMoney(due.amount, due.currency)}</p>
      {!paid && <p className="mt-4 text-sm leading-6 text-neutral-500">Si ya pagaste, puede demorar unos minutos en confirmarse. No hace falta que hagas nada más.</p>}
    </div>
  </main>;
}
