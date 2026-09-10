"use client";

import { useActionState } from "react";
import { createCheckout } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import type { z } from "zod";
import type { checkoutSelectionSchema } from "../domain/checkout";

type CheckoutSelection = z.infer<typeof checkoutSelectionSchema>;

export function CheckoutForm({ eventId, selections, requireDocument, free = false, termsDocumentId, termsVersion, refundPolicyDocumentId }: { eventId: string; selections: CheckoutSelection[]; requireDocument: boolean; free?: boolean; termsDocumentId: string; termsVersion: string; refundPolicyDocumentId: string }) {
  const [state, action] = useActionState(createCheckout, {});
  return <form action={action} className="grid gap-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="selections" value={JSON.stringify(selections)}/><input type="hidden" name="acceptedTermsDocumentId" value={termsDocumentId}/><input type="hidden" name="acceptedRefundPolicyDocumentId" value={refundPolicyDocumentId}/>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" autoComplete="given-name" required/></label><label className="label">Apellido<input className="field" name="lastName" autoComplete="family-name" required/></label></div>
    <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required/><span className="text-xs font-normal text-neutral-600">Te enviaremos tus accesos a este email. No vamos a crear una cuenta.</span></label>
    <label className="label">Teléfono <span className="text-neutral-600">(opcional)</span><input className="field" name="phone" type="tel" autoComplete="tel"/></label>
    {requireDocument ? <label className="label">DNI<input className="field" name="document" inputMode="numeric" autoComplete="off" required/></label> : <input type="hidden" name="document" value=""/>}
    <label className="flex items-start gap-2.5 text-xs leading-5 text-neutral-500"><input type="checkbox" name="acceptedTerms" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" required/><span>Acepto los <a href="/terminos" target="_blank" className="font-bold text-white underline">Términos y Condiciones</a> y la <a href="/reembolsos" target="_blank" className="font-bold text-white underline">Política de Reembolsos</a> (v{termsVersion}), y leí la <a href="/privacidad" target="_blank" className="font-bold text-white underline">Política de Privacidad</a>.</span></label>
    <ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14">{free ? "Confirmar entradas gratis" : "Reservar por 10 minutos"}</SubmitButton><p className="text-center text-xs leading-5 text-neutral-600">{free ? "No se solicitará ningún medio de pago." : "Después vas a Mercado Pago. La reserva comienza recién al continuar."}</p>
  </form>;
}
