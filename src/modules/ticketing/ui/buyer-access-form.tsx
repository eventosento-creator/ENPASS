"use client";

import { useRouter } from "next/navigation";
import { BuyerEmailCode } from "./buyer-email-code";

/** Ingreso del comprador (mis entradas, favoritos): email → código de 6 dígitos, sin salir de la página. */
export function BuyerAccessForm({ next, label = "Tu email", button = "Enviarme el código" }: { next?: string; label?: string; button?: string }) {
  const router = useRouter();
  return <div className="mt-7"><BuyerEmailCode next={next} emailLabel={label} sendLabel={button} onVerified={() => { if (next) router.push(next as never); router.refresh(); }}/></div>;
}
