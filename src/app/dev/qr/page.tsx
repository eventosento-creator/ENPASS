import { notFound } from "next/navigation";
import QRCode from "qrcode";

const fixtures = [
  { name: "Válida · Principal", detail: "General · 1 ingreso", payload: `NLOS1:${"A".repeat(43)}`, tone: "lime" },
  { name: "Ya utilizada", detail: "General · límite alcanzado", payload: `NLOS1:${"B".repeat(43)}`, tone: "red" },
  { name: "Demasiado temprano", detail: "General · valid_from futuro", payload: `NLOS1:${"C".repeat(43)}`, tone: "amber" },
  { name: "Fuera de horario", detail: "General · valid_until pasado", payload: `NLOS1:${"D".repeat(43)}`, tone: "amber" },
  { name: "Multi-ingreso", detail: "General · 2 ingresos", payload: `NLOS1:${"E".repeat(43)}`, tone: "lime" },
  { name: "VIP", detail: "Solo Acceso VIP", payload: `NLOS1:${"F".repeat(43)}`, tone: "lime" },
  { name: "Reembolsada", detail: "Estado refunded", payload: `NLOS1:${"G".repeat(43)}`, tone: "red" },
  { name: "Otro evento", detail: "Club Session", payload: `NLOS1:${"H".repeat(43)}`, tone: "red" },
  { name: "Cancelada", detail: "Estado cancelled", payload: `NLOS1:${"I".repeat(43)}`, tone: "red" },
] as const;

export const dynamic = "force-dynamic";

export default async function DevelopmentQrGallery() {
  if (process.env.NODE_ENV === "production") notFound();
  const rendered = await Promise.all(fixtures.map(async (fixture) => ({ ...fixture, svg: await QRCode.toString(fixture.payload, { type: "svg", margin: 1, width: 280, color: { dark: "#050505", light: "#ffffff" } }) })));
  return <main className="min-h-dvh bg-[#0a0a0b] px-4 py-8"><div className="mx-auto max-w-6xl"><p className="eyebrow">Solo desarrollo</p><h1 className="page-title mt-3">Galería de accesos</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-500">Usá estos QR con la cámara real o copiá el payload desde el panel de desarrollo del scanner. Un reset local restablece todos los estados.</p><div className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-white/[.03] p-4 text-sm sm:grid-cols-2"><p><span className="font-black text-white">PIN scanner:</span> <code className="ml-2 text-[var(--accent)]">320000</code></p><p><span className="font-black text-white">PIN supervisor:</span> <code className="ml-2 text-[var(--accent)]">320001</code></p></div><div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rendered.map((fixture) => <article className="card overflow-hidden" key={fixture.name}><div className="bg-white p-4" dangerouslySetInnerHTML={{ __html: fixture.svg }}/><div className="p-4"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${fixture.tone === "lime" ? "bg-lime-400" : fixture.tone === "amber" ? "bg-amber-400" : "bg-red-400"}`}/><h2 className="font-black">{fixture.name}</h2></div><p className="mt-2 text-xs text-neutral-500">{fixture.detail}</p><details className="mt-4"><summary className="cursor-pointer text-xs font-bold text-neutral-600">Ver payload</summary><code className="mt-2 block break-all rounded-lg bg-black p-2 text-[10px] text-neutral-500">{fixture.payload}</code></details></div></article>)}</div></div></main>;
}
