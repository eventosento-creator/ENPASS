"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copiá este link:", value); }
  }
  return <button type="button" className="btn btn-secondary" onClick={() => void copy()}>{copied ? <Check size={16}/> : <Copy size={16}/>}{copied ? "Copiado" : "Copiar link"}</button>;
}
