"use client";

import { useActionState } from "react";
import { createDivisionDueCheckoutLink, type DueCheckoutState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";
import { CopyLinkButton } from "@/modules/events/ui/copy-link-button";

export function DivisionDueOnlineCheckoutButton({ dueId }: { dueId: string }) {
  const [state, action] = useActionState<DueCheckoutState, FormData>(createDivisionDueCheckoutLink, {});
  if (state.checkoutUrl) return <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-neutral-500">Link de cobro listo, mandaselo al socio:</span><CopyLinkButton value={state.checkoutUrl}/></div>;
  return <form action={action} className="flex items-center gap-2">
    <input type="hidden" name="dueId" value={dueId}/>
    <SubmitButton className="btn btn-secondary" pendingLabel="Generando…">Cobrar online</SubmitButton>
    <ActionMessage message={state.error}/>
  </form>;
}
