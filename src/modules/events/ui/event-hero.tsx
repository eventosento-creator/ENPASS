"use client";

import Image from "next/image";
import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { EventCover } from "./event-cover";

// Hero horizontal y compacto: el flyer (casi siempre vertical) se ve completo sobre su propio fondo difuso,
// sin ocupar dos pantallas en el celular. Con una sola foto no hay controles de galería, solo "ampliar".
export function EventHero({ src, alt }: { src: string | null; alt: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="relative">
      <EventCover src={src} alt={alt} fit="contain" priority sizes="(max-width: 767px) 100vw, (max-width: 1024px) 60vw, 800px" className="h-[240px] rounded-2xl sm:h-[320px] md:aspect-[16/9] md:h-auto md:max-h-[520px] md:rounded-[1.4rem]"/>
      {src && <button type="button" aria-label="Ampliar imagen" onClick={() => setOpen(true)} className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/70"><Maximize2 aria-hidden size={18}/></button>}
    </div>
    {open && src && <div role="dialog" aria-modal aria-label={alt} className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onClick={() => setOpen(false)}>
      <button type="button" aria-label="Cerrar" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white" onClick={() => setOpen(false)}><X aria-hidden size={20}/></button>
      <div className="relative h-full w-full max-w-3xl"><Image src={src} alt={alt} fill sizes="100vw" className="object-contain"/></div>
    </div>}
  </>;
}
