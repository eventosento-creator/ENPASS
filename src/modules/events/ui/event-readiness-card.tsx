import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ReadinessItem, ReadinessResult } from "../domain/event-readiness";

const icons = { ok: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;
const tones = { ok: "text-emerald-600", warning: "text-amber-500", error: "text-red-500" } as const;

/** "¿Estás listo para la noche?": lo que falta, en orden, con un botón para arreglar cada cosa. Si está todo bien, queda plegado. */
export function EventReadinessCard({ result }: { result: ReadinessResult }) {
  const problems = result.items.filter((item) => item.level !== "ok");
  if (result.ready) return <details className="card mt-6 p-4 sm:p-5">
    <summary className="flex cursor-pointer list-none items-center gap-3"><CheckCircle2 className="shrink-0 text-emerald-600" size={22} aria-hidden/><span><b className="block">Todo listo para la noche</b><span className="text-xs text-neutral-500">Revisamos publicación, cobro, puertas y scanners. Tocá para ver el detalle.</span></span></summary>
    <ul className="mt-4 grid gap-2">{result.items.map((item) => <Row key={item.key} item={item}/>)}</ul>
  </details>;
  return <section aria-label="¿Estás listo para la noche?" className={`card mt-6 p-5 sm:p-6 ${result.errors > 0 ? "border-red-500/40" : "border-amber-400/40"}`}>
    <p className="eyebrow">Antes del evento</p>
    <h2 className="section-title mt-2">¿Estás listo para la noche?</h2>
    <p className="mt-2 text-sm text-neutral-500">{result.errors > 0 ? `Faltan ${problems.length} ${problems.length === 1 ? "cosa" : "cosas"}${result.errors < problems.length ? ` (${result.errors} ${result.errors === 1 ? "es importante" : "son importantes"})` : ""}.` : `Todo lo importante está, pero ${problems.length === 1 ? "queda 1 recomendación" : `quedan ${problems.length} recomendaciones`}.`}</p>
    <ul className="mt-4 grid gap-2">{[...problems, ...result.items.filter((item) => item.level === "ok")].map((item) => <Row key={item.key} item={item}/>)}</ul>
  </section>;
}

function Row({ item }: { item: ReadinessItem }) {
  const Icon = icons[item.level];
  return <li className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--border)] px-3.5 py-3">
    <Icon size={18} className={`mt-0.5 shrink-0 ${tones[item.level]}`} aria-label={item.level === "ok" ? "Listo" : item.level === "warning" ? "Recomendado" : "Falta"}/>
    <div className="min-w-[12rem] flex-1"><p className="text-sm font-bold">{item.title}</p><p className="text-xs leading-5 text-neutral-500">{item.detail}</p></div>
    {item.href && item.level !== "ok" && <Link href={item.href as never} className="btn btn-secondary min-h-9 shrink-0 px-3.5 text-xs">{item.action ?? "Arreglar"}</Link>}
  </li>;
}
