import { analyzeGateCoverage, type CoverageGate, type CoverageRule, type CoverageTicketType } from "@/modules/access/domain/gate-coverage";

export type ReadinessLevel = "ok" | "warning" | "error";
export type ReadinessItem = { key: string; level: ReadinessLevel; title: string; detail: string; href?: string; action?: string };

export type ReadinessInput = {
  eventId: string;
  status: string;
  capabilities: { tickets: boolean; access: boolean; pos: boolean };
  ticketTypes: (CoverageTicketType & { price_amount: number })[];
  gates: CoverageGate[];
  rules: CoverageRule[];
  /** Celulares de puerta activados (con el PIN ya cargado) y sin revocar. */
  activatedScanners: number;
  payment: { mercadoPagoConnected: boolean; transferEnabled: boolean };
  /** Solo si la taquilla está habilitada para el evento. */
  boxOffice: { enabled: boolean; registers: number; registersWithCashier: number };
};

export type ReadinessResult = { items: ReadinessItem[]; errors: number; warnings: number; ready: boolean };

/** Chequeo "¿estás listo para la noche?": lo que, si falta, deja gente afuera o sin poder comprar. Cada línea dice qué hacer. */
export function evaluateEventReadiness(input: ReadinessInput): ReadinessResult {
  const base = `/app/events/${input.eventId}`;
  const items: ReadinessItem[] = [];
  const activeTypes = input.ticketTypes.filter((type) => type.active);

  if (input.status === "draft") items.push({ key: "published", level: "error", title: "El evento no está publicado", detail: "Nadie puede comprar todavía. Tocá \"Publicar\" al final de esta pantalla." });
  else items.push({ key: "published", level: "ok", title: "Evento publicado", detail: "La gente ya puede verlo y comprar." });

  if (input.capabilities.tickets) {
    if (!activeTypes.length) items.push({ key: "tickets", level: "error", title: "No hay entradas a la venta", detail: "Creá al menos un tipo de entrada activo.", href: `${base}/tickets`, action: "Crear entradas" });
    else items.push({ key: "tickets", level: "ok", title: `${activeTypes.length} ${activeTypes.length === 1 ? "tipo de entrada" : "tipos de entrada"} a la venta`, detail: "Hay entradas disponibles para comprar." });

    const hasPaid = activeTypes.some((type) => type.price_amount > 0);
    if (hasPaid && !input.payment.mercadoPagoConnected && !input.payment.transferEnabled) {
      items.push({ key: "payment", level: "error", title: "No podés cobrar todavía", detail: "Conectá tu cuenta de Mercado Pago para recibir los pagos de las entradas.", href: "/app/settings", action: "Conectar Mercado Pago" });
    } else if (hasPaid) {
      items.push({ key: "payment", level: "ok", title: "Cobro configurado", detail: input.payment.mercadoPagoConnected ? "Mercado Pago está conectado." : "Podés recibir pagos por transferencia." });
    }
  }

  if (input.capabilities.access) {
    const coverage = analyzeGateCoverage({ ticketTypes: input.ticketTypes, gates: input.gates, rules: input.rules });
    if (coverage.noGates) items.push({ key: "gates", level: "error", title: "No hay ninguna puerta", detail: "Sin puertas, el scanner no deja entrar a nadie. Se crea con un toque.", href: `${base}/access`, action: "Crear la puerta" });
    else if (coverage.noActiveGates) items.push({ key: "gates", level: "error", title: "Todas las puertas están desactivadas", detail: "Activá al menos una puerta.", href: `${base}/access`, action: "Ir a Accesos" });
    else items.push({ key: "gates", level: "ok", title: "Puertas configuradas", detail: `${input.gates.filter((gate) => gate.active).length} ${input.gates.filter((gate) => gate.active).length === 1 ? "puerta operativa" : "puertas operativas"}.` });

    if (coverage.uncovered.length) items.push({ key: "coverage", level: "error", title: `${coverage.uncovered.length === 1 ? "Una entrada no pasa" : `${coverage.uncovered.length} entradas no pasan`} por ninguna puerta`, detail: `${coverage.uncovered.map((type) => type.name).join(", ")}: quienes la tengan no van a poder ingresar.`, href: `${base}/access`, action: "Arreglar" });
    else if (!coverage.noGates && !coverage.noActiveGates) items.push({ key: "coverage", level: "ok", title: "Todas las entradas pasan por una puerta", detail: "Ninguna queda afuera." });

    if (input.activatedScanners === 0) items.push({ key: "scanner", level: "warning", title: "Ningún celular está activado como scanner", detail: "En Accesos generá un PIN y cargalo en el celular de la puerta. Conviene probarlo antes de la fila.", href: `${base}/access`, action: "Generar PIN" });
    else items.push({ key: "scanner", level: "ok", title: `${input.activatedScanners} ${input.activatedScanners === 1 ? "scanner activado" : "scanners activados"}`, detail: "Hay celulares listos para escanear." });
  }

  if (input.boxOffice.enabled) {
    if (input.boxOffice.registers === 0) items.push({ key: "boxoffice", level: "warning", title: "La taquilla no tiene ninguna caja", detail: "Creá una caja y generá su código para cobrar en puerta.", href: `${base}/box-office`, action: "Crear caja" });
    else if (input.boxOffice.registersWithCashier === 0) items.push({ key: "boxoffice", level: "warning", title: "Ninguna caja tiene cajero asignado", detail: "Asigná un cajero para poder vender en puerta.", href: `${base}/box-office`, action: "Asignar cajero" });
    else items.push({ key: "boxoffice", level: "ok", title: "Taquilla lista", detail: `${input.boxOffice.registersWithCashier} ${input.boxOffice.registersWithCashier === 1 ? "caja con cajero" : "cajas con cajero"}.` });
  }

  const errors = items.filter((item) => item.level === "error").length;
  const warnings = items.filter((item) => item.level === "warning").length;
  return { items, errors, warnings, ready: errors === 0 && warnings === 0 };
}
