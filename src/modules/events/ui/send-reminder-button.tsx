"use client";

import { useActionState } from "react";
import { BellRing } from "lucide-react";
import { sendEventReminderAction } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function SendReminderButton({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(sendEventReminderAction, {});
  return <form action={action} className="flex flex-col items-end gap-2">
    <input type="hidden" name="eventId" value={eventId}/>
    <SubmitButton className="btn btn-secondary" pendingLabel="Enviando…"><BellRing size={17}/>Enviar recordatorio</SubmitButton>
    <div className="max-w-xs text-right"><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/></div>
  </form>;
}
