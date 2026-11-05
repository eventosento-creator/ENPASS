import "server-only";

import { SmtpEmailProvider } from "@/modules/ticketing/infrastructure/smtp-email-provider";
import type { ClubBrand } from "@/modules/ticketing/infrastructure/email-provider";
import { formatMoney } from "@/shared/lib/format";
import { membershipDueLog } from "@/shared/lib/structured-log";
import { createDueCheckout } from "./create-due-checkout";
import { createDivisionDueCheckout } from "./create-division-due-checkout";
import { createAdminClient } from "@/shared/database/admin";

// Todos best-effort: un mail que falla (SMTP caído, dirección inválida) nunca debe tirar abajo
// el alta, el cobro o la generación de cuotas — solo se loguea.

const periodLabel = (period: string) => new Date(`${period}T00:00:00`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("es-AR");
/** Nombre del alumno si la cuota es de un alumno a cargo de un tutor (el mail va al tutor y tiene que decir de quién es). */
async function studentNameForDue(dueId: string | undefined, kind: "club" | "division") {
  if (!dueId) return null;
  try {
    const admin = createAdminClient();
    let membershipId: string | undefined;
    if (kind === "club") {
      membershipId = (await admin.from("membership_dues").select("membership_id").eq("id", dueId).maybeSingle()).data?.membership_id;
    } else {
      const enrollmentId = (await admin.from("division_dues").select("enrollment_id").eq("id", dueId).maybeSingle()).data?.enrollment_id;
      membershipId = enrollmentId ? (await admin.from("membership_division_enrollments").select("membership_id").eq("id", enrollmentId).maybeSingle()).data?.membership_id : undefined;
    }
    if (!membershipId) return null;
    return (await admin.from("memberships").select("student_first_name").eq("id", membershipId).maybeSingle()).data?.student_first_name ?? null;
  } catch { return null; }
}
const withStudent = (student: string | null, concept?: string) => (student ? (concept ? `${student} (${concept})` : student) : concept);

const paymentMethodLabels: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", other: "Otro", mercado_pago: "Mercado Pago" };

export async function sendMembershipWelcomeEmail(input: {
  to: string; firstName: string; organizationName: string; memberNumber: string; categoryName: string; brand?: ClubBrand; studentName?: string;
}) {
  try {
    await new SmtpEmailProvider().sendMembershipWelcome({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName,
      memberNumber: input.memberNumber, categoryName: input.categoryName, brand: input.brand, studentName: input.studentName,
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
  const student = await studentNameForDue(input.dueId, "club");
  try {
    await new SmtpEmailProvider().sendMembershipDue({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: withStudent(student),
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      dueDateLabel: dateLabel(input.dueDate), payUrl, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "due_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

export async function sendDuePaidEmail(input: {
  dueId?: string; to: string; firstName: string; organizationName: string; period: string; amount: number; paymentMethod: string; currency?: string; brand?: ClubBrand;
}) {
  const student = await studentNameForDue(input.dueId, "club");
  try {
    await new SmtpEmailProvider().sendMembershipDuePaid({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: withStudent(student),
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      paymentMethodLabel: paymentMethodLabels[input.paymentMethod] ?? input.paymentMethod, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "paid_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

// Cuotas de división: mismo template que las de socio, con el nombre de la división como
// "concepto" en el asunto — y mismo intento de link de pago online que las cuotas de socio.
export async function sendDivisionDueGeneratedEmail(input: {
  dueId: string; to: string; firstName: string; organizationName: string; divisionName: string; period: string; amount: number; dueDate: string; currency?: string; brand?: ClubBrand;
}) {
  let payUrl: string | null = null;
  try {
    payUrl = (await createDivisionDueCheckout(input.dueId)).checkoutUrl;
  } catch { /* Sin Mercado Pago conectado, o cualquier otro motivo — el mail sale sin botón. */ }
  const student = await studentNameForDue(input.dueId, "division");
  try {
    await new SmtpEmailProvider().sendMembershipDue({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: withStudent(student, input.divisionName),
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      dueDateLabel: dateLabel(input.dueDate), payUrl, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "division_due_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}

export async function sendDivisionDuePaidEmail(input: {
  dueId?: string; to: string; firstName: string; organizationName: string; divisionName: string; period: string; amount: number; paymentMethod: string; currency?: string; brand?: ClubBrand;
}) {
  const student = await studentNameForDue(input.dueId, "division");
  try {
    await new SmtpEmailProvider().sendMembershipDuePaid({
      to: input.to, memberFirstName: input.firstName, organizationName: input.organizationName, concept: withStudent(student, input.divisionName),
      periodLabel: periodLabel(input.period), amountLabel: formatMoney(input.amount, input.currency ?? "ARS"),
      paymentMethodLabel: paymentMethodLabels[input.paymentMethod] ?? input.paymentMethod, brand: input.brand,
    });
  } catch (error) {
    membershipDueLog("membership_due.email.failed", { context: "division_paid_email", errorCode: error instanceof Error ? error.message : "unknown" });
  }
}
