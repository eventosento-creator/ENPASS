import { z } from "zod";

export const clubDoorActivationSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
export const clubDoorCheckInSchema = z.object({ payload: z.string().min(10).max(120) });

export type ClubDoorSessionView = { door_session_id: string; organization_id: string; organization_name: string; device_name: string; expires_at: string };

export type ClubDoorResult = "allowed" | "allowed_with_debt" | "denied_debt" | "denied_suspended" | "denied_cancelled" | "invalid" | "expired" | "device_not_authorized";

export type ClubDoorResponse = { result: ClubDoorResult; member_name: string | null; member_number: string | null; category_name: string | null; overdue_amount: number | null };

export type ClubDoorPresentation = { tone: "success" | "warning" | "danger"; title: string; detail: string; durationMs: number };

export function getClubDoorPresentation(response: ClubDoorResponse): ClubDoorPresentation {
  const debt = response.overdue_amount ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(response.overdue_amount / 100) : "";
  switch (response.result) {
    case "allowed": return { tone: "success", title: "Bienvenido", detail: "Socio al día", durationMs: 2200 };
    case "allowed_with_debt": return { tone: "warning", title: "Puede pasar", detail: `Tiene cuotas vencidas${debt ? ` (${debt})` : ""}`, durationMs: 3500 };
    case "denied_debt": return { tone: "danger", title: "Rechazado", detail: `Cuotas vencidas${debt ? `: ${debt}` : ""}`, durationMs: 3500 };
    case "denied_suspended": return { tone: "danger", title: "Rechazado", detail: "Membresía suspendida", durationMs: 3500 };
    case "denied_cancelled": return { tone: "danger", title: "Rechazado", detail: "Socio dado de baja", durationMs: 3500 };
    case "expired": return { tone: "warning", title: "QR vencido", detail: "Pedile que abra de nuevo su perfil de socio", durationMs: 3000 };
    case "device_not_authorized": return { tone: "danger", title: "Dispositivo sin autorización", detail: "Volvé a activarlo con el PIN", durationMs: 2500 };
    default: return { tone: "danger", title: "QR inválido", detail: "No es un código de socio de este club", durationMs: 3000 };
  }
}
