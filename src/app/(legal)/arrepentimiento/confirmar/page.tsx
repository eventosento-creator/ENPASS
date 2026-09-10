import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { confirmArrepentimiento } from "@/modules/legal/application/actions";

export default async function ConfirmarArrepentimientoPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <Result eligible={false} title="Enlace inválido" description="Este enlace no es válido. Iniciá la solicitud nuevamente."/>;

  const formData = new FormData();
  formData.set("token", token);
  const result = await confirmArrepentimiento({}, formData);

  if (result.error) return <Result eligible={false} title="No pudimos confirmar tu solicitud" description={result.error}/>;

  return <Result
    eligible={Boolean(result.eligible)}
    title={result.eligible ? "Solicitud confirmada" : "Solicitud registrada, no elegible"}
    description={result.eligible
      ? "Tu pedido cumple con las condiciones del derecho de arrepentimiento. Te enviamos un email con los próximos pasos."
      : (result.reason ?? "Tu pedido no cumple con las condiciones del derecho de arrepentimiento.")}
    managementCode={result.managementCode}
  />;
}

function Result({ eligible, title, description, managementCode }: { eligible: boolean; title: string; description: string; managementCode?: string }) {
  const Icon = eligible ? CheckCircle2 : XCircle;
  return <main className="container-shell grid min-h-screen place-items-center py-10">
    <section className="w-full max-w-md card p-6 text-center sm:p-8">
      <Icon className={`mx-auto ${eligible ? "text-[var(--accent)]" : "text-neutral-500"}`} size={40}/>
      <h1 className="mt-4 text-2xl font-black tracking-[-.02em]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-500">{description}</p>
      {managementCode && <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.035] p-4"><p className="text-[10px] font-black uppercase tracking-[.08em] text-neutral-500">Código de gestión</p><p className="mt-1 text-lg font-black tracking-[.04em]">{managementCode}</p></div>}
      <Link href="/" className="btn btn-secondary mt-7 w-full">Volver al inicio</Link>
    </section>
  </main>;
}
