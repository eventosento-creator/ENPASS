"use client";

import { useActionState, useState } from "react";
import { Heart, X } from "lucide-react";
import { toggleEventFavorite } from "../application/actions";
import { BuyerAccessForm } from "@/modules/ticketing/ui/buyer-access-form";

export function FavoriteButton({ eventId, initiallyFavorited, className = "" }: { eventId: string; initiallyFavorited: boolean; className?: string }) {
  const [state, action, pending] = useActionState(toggleEventFavorite, {});
  const [processedState, setProcessedState] = useState(state);
  const [showLogin, setShowLogin] = useState(false);
  const favorited = state.favorited ?? initiallyFavorited;

  if (state !== processedState) {
    setProcessedState(state);
    if (state.requiresLogin) setShowLogin(true);
  }

  return <>
    <form action={action} className={`absolute z-10 ${className}`}>
      <input type="hidden" name="eventId" value={eventId}/>
      <button
        type="submit"
        disabled={pending}
        aria-label={favorited ? "Quitar de favoritos" : "Guardar en favoritos"}
        aria-pressed={favorited}
        className="grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60 disabled:opacity-60"
      >
        <Heart aria-hidden size={16} className={favorited ? "fill-white" : ""}/>
      </button>
    </form>
    {showLogin && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowLogin(false)}>
      <div className="card w-full max-w-sm p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Favoritos</p><h2 className="mt-2 text-xl font-black">Iniciá sesión para guardar</h2><p className="mt-2 text-sm leading-6 text-neutral-500">Te mandamos un acceso a tu email, sin contraseña.</p></div><button aria-label="Cerrar" className="text-neutral-500 hover:text-white" onClick={() => setShowLogin(false)}><X size={18}/></button></div>
        <BuyerAccessForm/>
      </div>
    </div>}
  </>;
}
