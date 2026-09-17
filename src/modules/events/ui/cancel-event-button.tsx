"use client";

import { CircleSlash } from "lucide-react";
import { cancelEvent } from "../application/actions";

export function CancelEventButton({ eventId }: { eventId: string }) {
  return <form action={cancelEvent} onSubmit={(cancelSubmit) => {
    if (!window.confirm("¿Cancelar este evento? Se van a bloquear las ventas nuevas. Las entradas ya vendidas NO se reembolsan automáticamente — tenés que gestionarlo vos por Mercado Pago.")) cancelSubmit.preventDefault();
  }}>
    <input type="hidden" name="eventId" value={eventId}/>
    <button className="btn btn-ghost w-full justify-start text-red-400 hover:bg-red-400/10"><CircleSlash size={16}/>Cancelar evento</button>
  </form>;
}
