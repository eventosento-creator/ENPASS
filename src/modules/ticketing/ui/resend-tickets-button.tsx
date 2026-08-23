import { Send } from "lucide-react";
import { resendTickets } from "../application/actions";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ResendTicketsButton({ orderId, eventId }: { orderId: string; eventId: string }) {
  return <form action={resendTickets}>
    <input type="hidden" name="orderId" value={orderId}/>
    <input type="hidden" name="eventId" value={eventId}/>
    <SubmitButton className="btn btn-ghost min-h-10 px-3 text-xs" pendingLabel="Enviando…"><Send size={14}/> Reenviar</SubmitButton>
  </form>;
}
