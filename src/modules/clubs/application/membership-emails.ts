import "server-only";

import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import type { ClubBrand } from "@/modules/ticketing/infrastructure/email-provider";
import { formatMoney } from "@/shared/lib/format";
import { membershipDueLog } from "@/shared/lib/structured-log";
import { createDueCheckout } from "./create-due-checkout";

// Todos best-effort: un mail que falla (SMTP caído, dirección inválida) nunca debe tirar abajo
// el alta, el cobro o la generación de cuotas — solo se loguea.

const periodLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
const paymentMethodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", other: "Otro", mercado_pago: "Mercado Pago" };

export async function sendMembershipWelcomeEmail(input: {
  to: string; firstName: string; organizationName: string; memberNumber: string; categoryName: string; brand?: ClubBrand;
}) {
  try {
    await new SmtpEmailProvider().sendMembershipWelcome({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName,
      memberNumber: input.memberNumber, categoryName: input.categoryName, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "welcome_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

/** Intenta generar el link de cobro online de una vez (mismo camino que "Cobrar online" en la
 * ficha) para que el mail ya venga con el botón de pago. Si el club no tiene Mercado Pago
 * conectado o falla por cualquier motivo, el mail sale igual, solo que sin el botón. */
export async function sendDueGeneratedEmail(input: {
  dueId: string; to: string; firstName: string; organizationName: string; period: string; amount: number; dueDate: string; currency?: string; brand?: ClubBrand;
}) {
  let payUrl: string | null = null;
  try {
    payUrl = (await createDueCheckout(input.dueId)).checkoutUrl;
  } catch { /* Sin Mercado Pago conectado, o cualquier otro motivo — el mail sale sin botón. */ }
  try {
    await new SmtpEmailProvider().sendMembershipDue({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName,
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      dueDateLabel: dateLabel(input.dueDate), payUrl, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "due_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

export async function sendDuePaidEmail(input: {
  to: string; firstName: string; organizationName: string; period: string; amount: number; paymentMethod: string; currency?: string; brand?: ClubBrand;
}) {
  try {
    await new SmtpEmailProvider().sendMembershipDuePaid({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName,
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      paymentMethodLabel: paymentMethodLabels[input.paymentMethod] ?? input.paymentMethod, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "paid_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

// Cuotas de división: mismo template que las de socio, con el nombre de la división como
// "concepto" en el asunto. Sin cobro online por ahora — el pago sigue siendo manual (efectivo/
// transferencia), como arrancamos con las cuotas de socio antes de sumar Mercado Pago.
export async function sendDivisionDueGeneratedEmail(input: {
  to: string; firstName: string; organizationName: string; divisionName: string; period: string; amount: number; dueDate: string; currency?: string; brand?: ClubBrand;
}) {
  try {
    await new SmtpEmailProvider().sendMembershipDue({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: input.divisionName,
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      dueDateLabel: dateLabel(input.dueDate), payUrl: null, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "division_due_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

export async function sendDivisionDuePaidEmail(input: {
  to: string; firstName: string; organizationName: string; divisionName: string; period: string; amount: number; paymentMethod: string; currency?: string; brand?: ClubBrand;
}) {
  try {
    await new SmtpEmailProvider().sendMembershipDuePaid({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: input.divisionName,
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      paymentMethodLabel: paymentMethodLabels[input.paymentMethod] ?? input.paymentMethod, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "division_paid_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}
