"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

export function ShareLinkButtons({ url, shareLabel = "Compartir", compact = false }: { url: string; shareLabel?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Entradas", url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy();
  }

  return <div className={`flex ${compact ? "gap-2" : "flex-col gap-2 sm:flex-row"}`}>
    <button type="button" className={`btn btn-primary ${compact ? "min-h-11 px-3" : "flex-1"}`} onClick={share}><Share2 size={16}/>{shareLabel}</button>
    <button type="button" className={`btn btn-secondary ${compact ? "min-h-11 px-3" : "flex-1"}`} onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Link copiado" : "Copiar"}</button>
  </div>;
}
