"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createCheckout } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";
import type { z } from "zod";
import type { checkoutSelectionSchema } from "../domain/checkout";
import { holderFieldNames } from "../domain/holders";
import { BuyerEmailCode } from "@/modules/ticketing/ui/buyer-email-code";

type CheckoutSelection = z.infer<typeof checkoutSelectionSchema>;

export function CheckoutForm({ email, eventId, selections, requireDocument, free = false, termsDocumentId, termsVersion, refundPolicyDocumentId, promotionCode, attendees = [] }: { email: string | null; eventId: string; selections: CheckoutSelection[]; requireDocument: boolean; free?: boolean; termsDocumentId: string; termsVersion: string; refundPolicyDocumentId: string; promotionCode?: string; attendees?: { position: number; ticketName: string }[] }) {
  const [state, action] = useActionState(createCheckout, {});
  const router = useRouter();
  return <form action={action} className="grid gap-4"><input type="hidden" name="eventId" value={eventId}/>{promotionCode && <input type="hidden" name="promotionCode" value={promotionCode}/>}<input type="hidden" name="selections" value={JSON.stringify(selections)}/><input type="hidden" name="acceptedTermsDocumentId" value={termsDocumentId}/><input type="hidden" name="acceptedRefundPolicyDocumentId" value={refundPolicyDocumentId}/>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" autoComplete="given-name" required/></label><label className="label">Apellido<input className="field" name="lastName" autoComplete="family-name" required/></label></div>
    <label className="label">Teléfono <span className="text-neutral-600">(opcional)</span><input className="field" name="phone" type="tel" autoComplete="tel"/></label>
    {requireDocument || !free ? <label className="label">DNI<input className="field" name="document" inputMode="numeric" autoComplete="off" pattern="[0-9.]{7,10}" minLength={7} maxLength={10} title="Ingresá tu DNI, solo números" required/>{!free && <span className="text-xs font-normal text-neutral-600">Lo necesitamos para emitir la factura del cargo de servicio.</span>}</label> : <input type="hidden" name="document" value=""/>}
    {attendees.length > 0 && <fieldset className="grid gap-3 rounded-2xl border border-[var(--border)] p-4"><legend className="px-1 text-sm font-black">¿Quién va a cada entrada?</legend>
      <p className="text-xs leading-5 text-neutral-500">La entrada 1 queda a tu nombre. Para las demás, pedí los datos de cada persona: el nombre sale en la lista de la puerta. Después podés cambiarlo desde Mis entradas.</p>
      {attendees.map((attendee) => { const names = holderFieldNames(attendee.position); return <div key={attendee.position} className="grid gap-3 rounded-xl bg-[var(--surface-strong)]/50 p-3"><p className="text-xs font-black uppercase tracking-[.08em] text-neutral-500">Entrada {attendee.position} · {attendee.ticketName}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Nombre<input className="field" name={names.first} autoComplete="off" maxLength={80} required/></label><label className="label">Apellido<input className="field" name={names.last} autoComplete="off" maxLength={80} required/></label></div>
        {requireDocument && <label className="label">DNI<input className="field" name={names.document} inputMode="numeric" autoComplete="off" pattern="[0-9.]{7,10}" minLength={7} maxLength={10} title="Ingresá el DNI, solo números" required/></label>}</div>; })}
    </fieldset>}
    {email
      ? <div className="label">Email de tu cuenta<p className="field flex items-center gap-2 bg-[var(--surface-raised)] text-neutral-400" aria-readonly><Check size={16} className="shrink-0 text-[var(--success)]" aria-hidden/>{email}</p><span className="text-xs font-normal text-neutral-600">Verificado. Te enviaremos tus accesos a este email.</span></div>
      : <fieldset className="grid gap-3 rounded-2xl border border-[var(--border)] p-4"><legend className="px-1 text-sm font-black">Último paso: tu email</legend>
        <p className="text-xs leading-5 text-neutral-500">Te mandamos un código de 6 dígitos para confirmar que es tuyo. Ahí te llegan las entradas. Lo que completaste arriba queda guardado.</p>
        <BuyerEmailCode emailLabel="Tu email" sendLabel="Enviarme el código" onVerified={() => router.refresh()}/></fieldset>}
    <label className="flex items-start gap-2.5 text-xs leading-5 text-neutral-500"><input type="checkbox" name="acceptedTerms" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" required/><span>Acepto los <a href="/terminos" target="_blank" className="font-bold text-white underline">Términos y Condiciones</a> y la <a href="/reembolsos" target="_blank" className="font-bold text-white underline">Política de Reembolsos</a> (v{termsVersion}), y leí la <a href="/privacidad" target="_blank" className="font-bold text-white underline">Política de Privacidad</a>.</span></label>
    <ActionMessage message={state.error}/><SubmitButton disabled={!email} className="btn btn-primary min-h-14">{free ? "Confirmar entradas gratis" : "Reservar por 10 minutos"}</SubmitButton><p className="text-center text-xs leading-5 text-neutral-600">{free ? "No se solicitará ningún medio de pago." : "Después elegís cómo pagar. La reserva comienza recién al continuar."}</p>
  </form>;
}
