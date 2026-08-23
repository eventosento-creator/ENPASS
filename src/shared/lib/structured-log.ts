type PaymentLogEvent =
  | "payment.create"
  | "payment.create.failed"
  | "payment.webhook.received"
  | "payment.webhook.processed"
  | "payment.webhook.failed"
  | "payment.approved"
  | "payment.rejected"
  | "oauth.connected"
  | "oauth.disconnected"
  | "oauth.refresh.failed";

type SafeLogValue = string | number | boolean | null | undefined;

export function paymentLog(event: PaymentLogEvent, fields: Record<string, SafeLogValue> = {}) {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...fields,
  }));
}

type TicketingLogEvent =
  | "ticket.issue.started"
  | "ticket.issue.completed"
  | "ticket.issue.failed"
  | "ticket.email.sent"
  | "ticket.email.failed"
  | "buyer.access.requested"
  | "buyer.access.granted";

export function ticketingLog(event: TicketingLogEvent, fields: Record<string, SafeLogValue> = {}) {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...fields,
  }));
}
