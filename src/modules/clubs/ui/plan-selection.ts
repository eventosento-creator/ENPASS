// Evento del navegador que conecta las filas de "Categorías y cuotas" con el formulario "Quiero ser socio":
// al tocar una modalidad, el formulario queda con esa categoría/división elegida.
export const PLAN_SELECT_EVENT = "club-plan-select";
export type PlanSelection = { categoryId: string | null; divisionId: string | null; label: string; fee: number };
