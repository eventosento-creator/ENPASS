"use client";

import { trackMeta } from "@/shared/ui/meta-pixel";

// WhatsApp de ventas de ENPASS (solo dígitos, con código de país). Es público; la variable permite cambiarlo sin tocar código.
const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5492616607903").replace(/\D/g, "");
const DEFAULT_MESSAGE = "Hola! Quiero info para vender las entradas de mi evento con ENPASS.";

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.6 2 2.16 6.43 2.16 11.88c0 1.74.46 3.44 1.32 4.94L2.08 22l5.32-1.39a9.86 9.86 0 0 0 4.64 1.18h.01c5.45 0 9.88-4.43 9.88-9.88a9.82 9.82 0 0 0-2.88-7Zm-7 15.2h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.16.83.84-3.08-.2-.32a8.2 8.2 0 0 1-1.25-4.38c0-4.53 3.69-8.22 8.23-8.22a8.2 8.2 0 0 1 8.21 8.23c0 4.53-3.69 8.22-8.18 8.22Zm4.5-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48a.92.92 0 0 0-.66.31c-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z"/></svg>;
}

// Botón para escribir por WhatsApp desde la web. El clic se mide como "Contact" en el Pixel de Meta.
export function WhatsAppCta({ message = DEFAULT_MESSAGE, label = "Escribinos por WhatsApp", variant = "button" }: { message?: string; label?: string; variant?: "button" | "floating" }) {
  if (!number) return null;
  const href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  const onClick = () => trackMeta("Contact", { content_name: "whatsapp" });
  if (variant === "floating") {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={label} className="fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-[var(--shadow-float)] transition hover:scale-105 sm:bottom-6 sm:right-6"><WhatsAppIcon size={28}/></a>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className="btn btn-secondary"><WhatsAppIcon/>{label}</a>;
}
