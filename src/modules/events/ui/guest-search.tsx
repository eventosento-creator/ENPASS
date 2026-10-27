"use client";

import { Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { markGuestEntry, undoGuestEntry, updateGuestHolder } from "../application/guest-entry-actions";

export type GuestRow = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  /** Mesas y asientos no se editan desde acá. */
  editable: boolean;
  document: string | null;
  typeLabel: string;
  status: "valid" | "cancelled" | "refunded";
  checkedIn: boolean;
  usedEntries: number;
  maxEntries: number;
  issuedAt: string;
};

export function GuestSearch({ guests, eventId, canMarkEntry = false, canEditHolder = false, requireDocument = false }: { guests: GuestRow[]; eventId: string; canMarkEntry?: boolean; canEditHolder?: boolean; requireDocument?: boolean }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return guests;
    return guests.filter((guest) =>
      guest.name.toLowerCase().includes(normalized) ||
      guest.document?.toLowerCase().includes(normalized) ||
      guest.typeLabel.toLowerCase().includes(normalized));
  }, [guests, query]);

  return <div>
    <label className="field flex items-center gap-2.5 px-4"><Search size={16} className="shrink-0 text-neutral-500"/><input className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" placeholder="Buscar por nombre o documento" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <p className="mt-3 text-xs font-bold text-neutral-500">{filtered.length} {filtered.length === 1 ? "invitado" : "invitados"}{query && ` de ${guests.length}`}</p>
    <div className="mt-4 card overflow-hidden">
      {filtered.length ? <div className="divide-y divide-white/[.06]">{filtered.map((guest) => <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4" key={guest.id}>
        <div><p className="font-bold">{guest.name}</p><p className="mt-0.5 text-xs text-neutral-500">{guest.document ? `DNI ${guest.document} · ` : ""}{guest.typeLabel}</p></div>
        <StatusBadge status={guest.status}/>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${guest.checkedIn ? "status-success" : "border border-white/10 text-neutral-500"}`}><span className={`size-1.5 rounded-full ${guest.checkedIn ? "bg-[var(--success)]" : "bg-neutral-600"}`}/>{guest.checkedIn ? (guest.maxEntries > 1 ? `Ingresó ${guest.usedEntries}/${guest.maxEntries}` : "Ingresó") : "No ingresó"}</span>
        {canMarkEntry && <EntryButton guest={guest} eventId={eventId}/>}
        {canEditHolder && guest.editable && guest.status === "valid" && <HolderEditor guest={guest} eventId={eventId} requireDocument={requireDocument}/>}
      </div>)}</div> : <div className="p-10 text-center text-sm text-neutral-500">No encontramos invitados con esa búsqueda.</div>}
    </div>
  </div>;
}

function StatusBadge({ status }: { status: GuestRow["status"] }) {
  const labels = { valid: "Válida", cancelled: "Cancelada", refunded: "Reembolsada" } as const;
  const tone = status === "valid" ? "status-success" : status === "cancelled" ? "border border-white/10 text-neutral-500" : "status-warning";
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{labels[status]}</span>;
}

function EntryButton({ guest, eventId }: { guest: GuestRow; eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (guest.status !== "valid") return <span/>;
  const canEnter = guest.usedEntries < guest.maxEntries;
  function run(action: typeof markGuestEntry) {
    setError(null);
    startTransition(async () => { const result = await action(guest.id, eventId); if (result.error) setError(result.error); });
  }
  return <div className="flex flex-col items-start gap-1 sm:items-end">
    <div className="flex gap-2">
      {canEnter && <button type="button" className="btn btn-secondary min-h-9 px-3 text-xs" disabled={pending} onClick={() => { if (window.confirm(`¿Marcar que ${guest.name} ingresó?`)) run(markGuestEntry); }}>{pending ? "…" : "Marcar ingreso"}</button>}
      {guest.checkedIn && <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" disabled={pending} onClick={() => run(undoGuestEntry)}>Deshacer</button>}
    </div>
    {error && <p className="text-[11px] font-semibold text-red-500" role="alert">{error}</p>}
  </div>;
}

/** Corregir el nombre de una entrada (el comprador de antes de las entradas nominales, un error de tipeo, un cambio de último momento). */
function HolderEditor({ guest, eventId, requireDocument }: { guest: GuestRow; eventId: string; requireDocument: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateGuestHolder({ ticketId: guest.id, eventId, firstName: String(formData.get("firstName") ?? ""), lastName: String(formData.get("lastName") ?? ""), document: String(formData.get("document") ?? "") });
      if (result.error) setError(result.error); else setOpen(false);
    });
  }
  return <div className="sm:col-span-full">
    <button type="button" className="btn btn-ghost min-h-9 px-3 text-xs" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Editar nombre</button>
    {open && <form action={submit} className="mt-2 grid gap-3 rounded-xl bg-[var(--surface-strong)]/50 p-3">
      <div className="grid gap-3 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" defaultValue={guest.firstName} maxLength={80} required/></label><label className="label">Apellido<input className="field" name="lastName" defaultValue={guest.lastName} maxLength={80} required/></label></div>
      <label className="label max-w-xs">DNI {requireDocument ? "" : <span className="text-neutral-500">(opcional)</span>}<input className="field" name="document" defaultValue={guest.document ?? ""} inputMode="numeric" pattern="[0-9.]{7,10}" minLength={requireDocument ? 7 : undefined} maxLength={10} required={requireDocument}/></label>
      {error && <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>}
      <div className="flex gap-2"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar nombre"}</button><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button></div>
    </form>}
  </div>;
}
