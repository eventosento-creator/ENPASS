export type CoverageTicketType = { id: string; name: string; active: boolean };
export type CoverageGate = { id: string; active: boolean };
export type CoverageRule = { access_gate_id: string; ticket_type_id: string };

export type GateCoverage = {
  /** El evento no tiene ninguna puerta creada. */
  noGates: boolean;
  /** Hay puertas, pero todas están desactivadas. */
  noActiveGates: boolean;
  /** Tipos de entrada activos que no pasan por ninguna puerta operativa: quien los tenga no puede ingresar. */
  uncovered: { id: string; name: string }[];
};

/** Detecta, antes del evento, las entradas que el scanner rechazaría por no estar aceptadas en ninguna puerta. */
export function analyzeGateCoverage(input: { ticketTypes: CoverageTicketType[]; gates: CoverageGate[]; rules: CoverageRule[] }): GateCoverage {
  const activeTypes = input.ticketTypes.filter((type) => type.active);
  const activeGateIds = new Set(input.gates.filter((gate) => gate.active).map((gate) => gate.id));
  const coveredTypeIds = new Set(input.rules.filter((rule) => activeGateIds.has(rule.access_gate_id)).map((rule) => rule.ticket_type_id));
  return {
    noGates: input.gates.length === 0 && activeTypes.length > 0,
    noActiveGates: input.gates.length > 0 && activeGateIds.size === 0 && activeTypes.length > 0,
    uncovered: input.gates.length === 0 ? [] : activeTypes.filter((type) => !coveredTypeIds.has(type.id)).map((type) => ({ id: type.id, name: type.name })),
  };
}

export function hasCoverageProblem(coverage: GateCoverage) {
  return coverage.noGates || coverage.noActiveGates || coverage.uncovered.length > 0;
}
