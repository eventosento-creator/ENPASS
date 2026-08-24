import { z } from "zod";

export const SCANNER_SESSION_COOKIE = "nlos_scanner_session";
export const QR_PAYLOAD_PATTERN = /^NLOS1:[A-Za-z0-9_-]{43}$/;

export const scannerActivationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

export const scannerCheckInSchema = z.object({
  payload: z.string().regex(QR_PAYLOAD_PATTERN),
  idempotencyKey: z.uuid(),
});

export const scannerOverrideSchema = z.object({
  checkinId: z.uuid(),
  reason: z.enum(["wrong_gate", "outside_window", "supervisor_exception"]),
  idempotencyKey: z.uuid(),
});

export const scannerManualSchema = z.object({
  shortCode: z.string().trim().toUpperCase().regex(/^N[A-Z0-9]{3}-[A-Z0-9]{2}$/),
});

export const scannerManualCheckInSchema = scannerManualSchema.extend({
  idempotencyKey: z.uuid(),
});

export type ScannerPermission = "scanner" | "supervisor";
export type CheckInResult =
  | "valid"
  | "already_used"
  | "invalid"
  | "wrong_event"
  | "wrong_gate"
  | "too_early"
  | "too_late"
  | "cancelled"
  | "refunded"
  | "expired"
  | "device_not_authorized"
  | "rate_limited";

export type ScannerSessionView = {
  scanner_session_id: string;
  event_id: string;
  event_name: string;
  gate_id: string;
  gate_name: string;
  permission: ScannerPermission;
  event_timezone: string;
  expires_at: string;
};

export type CheckInResponse = {
  result: CheckInResult;
  checkin_id: string | null;
  ticket_id: string | null;
  holder_name: string | null;
  ticket_type_name: string | null;
  sector: string | null;
  short_code: string | null;
  used_entries: number | null;
  max_entries: number | null;
  first_used_at: string | null;
  first_used_gate_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  suggested_gate_name: string | null;
  scanned_at: string;
  override?: boolean;
};

export type ResultPresentation = {
  tone: "success" | "danger" | "warning";
  title: string;
  detail: string;
  durationMs: number;
};

export function isNightlifeQrPayload(value: string) {
  return QR_PAYLOAD_PATTERN.test(value);
}

export function canUseSupervisorTools(permission: ScannerPermission) {
  return permission === "supervisor";
}

export function getResultPresentation(response: Pick<CheckInResponse, "result" | "suggested_gate_name">): ResultPresentation {
  switch (response.result) {
    case "valid": return { tone: "success", title: "INGRESO VÁLIDO", detail: "Acceso registrado", durationMs: 1000 };
    case "already_used": return { tone: "danger", title: "YA UTILIZADA", detail: "Esta entrada ya alcanzó su límite", durationMs: 1800 };
    case "wrong_gate": return { tone: "danger", title: "PUERTA INCORRECTA", detail: response.suggested_gate_name ? `Dirigir a ${response.suggested_gate_name}` : "Revisá la puerta asignada", durationMs: 1800 };
    case "wrong_event": return { tone: "danger", title: "OTRO EVENTO", detail: "La entrada no corresponde a este evento", durationMs: 1800 };
    case "too_early": return { tone: "warning", title: "TODAVÍA NO VÁLIDA", detail: "La ventana de acceso aún no comenzó", durationMs: 1800 };
    case "too_late": return { tone: "warning", title: "FUERA DE HORARIO", detail: "La ventana de acceso terminó", durationMs: 1800 };
    case "cancelled": return { tone: "danger", title: "CANCELADA", detail: "Esta entrada fue anulada", durationMs: 1800 };
    case "refunded": return { tone: "danger", title: "REEMBOLSADA", detail: "Esta entrada fue reembolsada", durationMs: 1800 };
    case "expired": return { tone: "danger", title: "EXPIRADA", detail: "Esta entrada ya no está vigente", durationMs: 1800 };
    case "device_not_authorized": return { tone: "danger", title: "DISPOSITIVO NO AUTORIZADO", detail: "Volvé a ingresar el PIN", durationMs: 2000 };
    case "rate_limited": return { tone: "warning", title: "BAJÁ EL RITMO", detail: "Esperá unos segundos antes de continuar", durationMs: 1800 };
    default: return { tone: "danger", title: "ENTRADA INVÁLIDA", detail: "No pudimos validar este código", durationMs: 1600 };
  }
}
