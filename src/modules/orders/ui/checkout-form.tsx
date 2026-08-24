"use client";

import { useActionState } from "react";
import { createCheckout } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

export function CheckoutForm({ eventId, selections, requireDocument }: { eventId: string; selections: { ticket_type_id: string; quantity: number }[]; requireDocument: boolean }) {
  const [state, action] = useActionState(createCheckout, {});
  return <form action={action} className="grid gap-4"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="selections" value={JSON.stringify(selections)}/>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Nombre<input className="field" name="firstName" autoComplete="given-name" required/></label><label className="label">Apellido<input className="field" name="lastName" autoComplete="family-name" required/></label></div>
    <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required/><span className="text-xs font-normal text-neutral-600">Te enviaremos la entrada a este email. No vamos a crear una cuenta.</span></label>
    <label className="label">Teléfono <span className="text-neutral-600">(opcional)</span><input className="field" name="phone" type="tel" autoComplete="tel"/></label>
    {requireDocument ? <label className="label">DNI<input className="field" name="document" inputMode="numeric" autoComplete="off" required/></label> : <input type="hidden" name="document" value=""/>}
    <ActionMessage message={state.error}/><SubmitButton className="btn btn-primary min-h-14">Reservar por 10 minutos</SubmitButton><p className="text-center text-xs leading-5 text-neutral-600">Después vas a Mercado Pago. La reserva comienza recién al continuar.</p>
  </form>;
}
