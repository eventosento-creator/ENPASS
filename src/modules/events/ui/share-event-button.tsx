"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

export function ShareEventButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "ENPASS", url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return <button type="button" className="btn btn-secondary" onClick={share}>{copied ? <Check size={17}/> : <Share2 size={17}/>} {copied ? "Copiado" : "Compartir"}</button>;
}
