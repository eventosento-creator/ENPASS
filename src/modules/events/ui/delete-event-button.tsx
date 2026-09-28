"use client";

import { Trash2 } from "lucide-react";
import { deleteEvent } from "../application/actions";

export function DeleteEventButton({ eventId }: { eventId: string }) {
  return <form action={deleteEvent} onSubmit={(deleteSubmit) => {
    if (!window.confirm("¿Borrar este evento? Esto no se puede deshacer. Solo funciona si el evento nunca tuvo ventas.")) deleteSubmit.preventDefault();
  }}>
    <input type="hidden" name="eventId" value={eventId}/>
    <button className="btn btn-ghost w-full justify-start text-red-400 hover:bg-red-400/10"><Trash2 size={16}/>Borrar evento</button>
  </form>;
}
