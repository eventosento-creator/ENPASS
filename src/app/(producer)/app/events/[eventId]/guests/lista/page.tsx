import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEventGuestList } from "@/modules/events/application/guest-list";
import { PrintButton } from "@/modules/events/ui/print-button";
import { formatEventDate } from "@/shared/lib/format";

// Lista para imprimir o llevar en el celular: nombres en orden alfabético con un casillero para tildar al ingresar.
export default async function PrintableGuestListPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const list = await getEventGuestList(eventId);
  if (!list) notFound();
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/app/events/${eventId}/guests` as never} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-neutral-500"><ArrowLeft size={16}/>Volver a invitados</Link>
      <div className="flex flex-wrap gap-2"><a className="btn btn-secondary" href={`/app/events/${eventId}/guests/export`}>Descargar (CSV)</a><PrintButton/></div>
    </div>
    <header className="mt-4 print:mt-0">
      <h1 className="page-title">{list.event.name}</h1>
      <p className="mt-2 text-sm text-neutral-500">Lista de invitados · {formatEventDate(list.event.starts_at, "America/Argentina/Buenos_Aires")} · {list.guests.length} {list.guests.length === 1 ? "persona" : "personas"}</p>
    </header>
    {list.guests.length ? <ol className="mt-6 columns-1 gap-8 sm:columns-2 print:columns-2">
      {list.guests.map((guest, index) => <li key={`${guest.name}-${index}`} className="flex break-inside-avoid items-center gap-3 border-b border-[var(--border)] py-2 text-sm">
        <span className="w-8 shrink-0 text-xs text-neutral-500">{index + 1}</span>
        <span className="size-4 shrink-0 rounded-sm border border-neutral-500" aria-hidden/>
        <span className="min-w-0 flex-1 font-bold">{guest.name}</span>
      </li>)}
    </ol> : <p className="mt-8 text-sm text-neutral-500">Todavía no hay invitados con entrada vigente.</p>}
  </>;
}
