import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import type { ReadinessItem, ReadinessResult } from "../domain/event-readiness";

const icons = { ok: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;
const tones = { ok: "text-emerald-600", warning: "text-amber-500", error: "text-red-500" } as const;

/**
 * "¿Estás listo para la noche?": una sola línea que se despliega con un toque. Cerrada por defecto para no tapar el resumen del evento;
 * el borde y el ícono de la línea avisan si falta algo importante. Adentro: primero lo que falta (con su botón) y después lo que ya está.
 */
export function EventReadinessCard({ result }: { result: ReadinessResult }) {
  const problems = result.items.filter((item) => item.level !== "ok");
  const done = result.items.filter((item) => item.level === "ok");
  const level = result.errors > 0 ? "error" : result.warnings > 0 ? "warning" : "ok";
  const Icon = icons[level];
  const headline = result.ready ? "Todo listo para la noche"
    : result.errors > 0 ? `Faltan ${problems.length} ${problems.length === 1 ? "cosa" : "cosas"} para la noche${result.errors < problems.length ? ` (${result.errors} ${result.errors === 1 ? "importante" : "importantes"})` : ""}`
    : `Todo lo importante está · ${problems.length === 1 ? "1 recomendación" : `${problems.length} recomendaciones`}`;
  return <details className={`group card mt-6 ${level === "error" ? "border-red-500/40" : level === "warning" ? "border-amber-400/40" : ""}`}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
      <Icon className={`shrink-0 ${tones[level]}`} size={22} aria-hidden/>
      <span className="min-w-0 flex-1"><b className="block text-sm sm:text-base">{headline}</b><span className="text-xs text-neutral-500">{result.ready ? "Revisamos publicación, cobro, puertas y scanners." : "¿Estás listo para la noche? Tocá para ver qué falta."}</span></span>
      <ChevronDown size={18} className="shrink-0 text-neutral-500 transition group-open:rotate-180" aria-hidden/>
    </summary>
    <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 sm:px-5">
      {problems.length > 0 && <ul className="grid gap-2">{problems.map((item) => <Row key={item.key} item={item}/>)}</ul>}
      {done.length > 0 && <ul className={`grid gap-1.5 ${problems.length > 0 ? "mt-4" : ""}`} aria-label="Lo que ya está listo">{done.map((item) => <li key={item.key} className="flex items-start gap-2.5 text-xs text-neutral-500"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Listo"/><span><b className="text-[var(--text)]">{item.title}</b> · {item.detail}</span></li>)}</ul>}
    </div>
  </details>;
}

function Row({ item }: { item: ReadinessItem }) {
  const Icon = icons[item.level];
  return <li className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--border)] px-3.5 py-3">
    <Icon size={18} className={`mt-0.5 shrink-0 ${tones[item.level]}`} aria-label={item.level === "warning" ? "Recomendado" : "Falta"}/>
    <div className="min-w-[12rem] flex-1"><p className="text-sm font-bold">{item.title}</p><p className="text-xs leading-5 text-neutral-500">{item.detail}</p></div>
    {item.href && <Link href={item.href as never} className="btn btn-secondary min-h-9 shrink-0 px-3.5 text-xs">{item.action ?? "Arreglar"}</Link>}
  </li>;
}
