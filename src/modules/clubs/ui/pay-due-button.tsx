"use client";

import { useActionState } from "react";
import { CreditCard } from "lucide-react";
import { payMemberDue, type MemberPortalState } from "../application/member-portal-actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function PayDueButton({ slug, dueId, label = "Pagar" }: { slug: string; dueId: string; label?: string }) {
  const [state, action] = useActionState<MemberPortalState, FormData>(payMemberDue, {});
  return <form action={action} className="grid justify-items-end gap-1">
    <input type="hidden" name="slug" value={slug}/>
    <input type="hidden" name="dueId" value={dueId}/>
    <SubmitButton className="btn btn-primary min-h-11 px-5" pendingLabel="Abriendo Mercado Pago…"><CreditCard aria-hidden size={16}/>{label}</SubmitButton>
    <ActionMessage message={state.error}/>
  </form>;
}
