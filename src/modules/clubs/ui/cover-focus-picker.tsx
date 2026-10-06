"use client";

import { useEffect, useRef, useState } from "react";

/** Elegir la portada y qué parte queda visible: se toca la foto para marcar el punto de enfoque (con vista previa del recorte). */
export function CoverFocusPicker({ initialUrl, initialX, initialY }: { initialUrl: string | null; initialX: number; initialY: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [focus, setFocus] = useState({ x: initialX, y: initialY });
  const [removed, setRemoved] = useState(false);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setPreview(objectUrl.current);
    setFocus({ x: 50, y: 50 });
    setRemoved(false);
  }
  function pick(event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setFocus({ x: Math.round(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))), y: Math.round(Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))) });
  }
  const shown = removed ? null : preview;
  const position = `${focus.x}% ${focus.y}%`;

  return <div className="grid gap-3">
    <p className="text-sm font-semibold">Foto de portada</p>
    <input type="hidden" name="coverFocusX" value={focus.x}/>
    <input type="hidden" name="coverFocusY" value={focus.y}/>
    {shown && <>
      <div>
        <p className="mb-1.5 text-xs text-neutral-500">Tocá la foto para elegir qué parte se ve:</p>
        <button type="button" onClick={pick} aria-label="Elegir la parte visible de la portada" className="relative block w-full cursor-crosshair overflow-hidden rounded-xl border border-white/[.08]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="Portada del club" className="block max-h-72 w-full object-contain"/>
          <span aria-hidden className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,.5)]" style={{ left: `${focus.x}%`, top: `${focus.y}%` }}/>
        </button>
      </div>
      <div>
        <p className="mb-1.5 text-xs text-neutral-500">Así se va a ver en el banner y en el directorio:</p>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="h-20 w-full rounded-lg object-cover" style={{ objectPosition: position }}/>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="" className="h-20 w-full rounded-lg object-cover" style={{ objectPosition: position }}/>
        </div>
      </div>
    </>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="btn btn-secondary cursor-pointer"><span>{shown ? "Cambiar portada" : "Subir portada"}</span><input ref={inputRef} className="sr-only" name="cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0])}/></label>
      {initialUrl && <label className="flex items-center gap-2 text-xs text-neutral-500"><input type="checkbox" name="removeCover" checked={removed} onChange={(event) => { setRemoved(event.target.checked); }}/>Quitar portada</label>}
    </div>
    <p className="text-xs text-neutral-500">Se ve de fondo en el panel del club y en su página pública. Mejor horizontal, hasta 3 MB.</p>
  </div>;
}
