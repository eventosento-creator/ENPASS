"use client";

import { useActionState } from "react";
import { UndoDot } from "lucide-react";
import { startArrepentimiento } from "@/modules/legal/application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { ActionMessage } from "@/shared/ui/action-message";

export default function ArrepentimientoPage() {
  const [state, action] = useActionState(startArrepentimiento, {});
  return <main className="container-shell grid min-h-screen place-items-center py-10">
    <section className="w-full max-w-md card p-6 sm:p-8">
      <div className="flex items-center gap-2"><UndoDot size={20} className="text-[var(--accent)]"/><p className="eyebrow">Botón de Arrepentimiento</p></div>
      <h1 className="mt-3 text-2xl font-black tracking-[-.02em]">Iniciar una solicitud</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-500">Si tu compra cumple las condiciones de la <a href="/reembolsos" className="font-bold text-white underline">Política de Reembolsos</a> (10 días desde la compra, al menos 24hs antes del evento, entrada no utilizada), te enviamos un email para confirmar y darte un código de gestión.</p>
      {state.success ? <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.035] p-4 text-sm leading-6 text-neutral-300">{state.success}</div> : <form action={action} className="mt-6 grid gap-4">
        <label className="label">Email de la compra<input className="field" name="email" type="email" autoComplete="email" required/></label>
        <label className="label">Código de tu compra<input className="field" name="orderPublicId" autoComplete="off" placeholder="El código que aparece en la URL de tu confirmación" required/></label>
        <ActionMessage message={state.error}/>
        <SubmitButton className="btn btn-primary min-h-14">Enviar solicitud</SubmitButton>
      </form>}
    </section>
  </main>;
}
