// Roles del equipo del club (colaboradores). El dueño y los admins de la organización no tienen rol: pueden todo.
// Los mismos permisos se verifican en la base (migración 20261011120000_club_roles.sql); acá solo se usan para mostrar u ocultar.

export type ClubRole = "admin" | "treasurer" | "coordinator" | "viewer";
/** members: alta/edición de socios y solicitudes · structure: categorías y divisiones · dues: cuotas, pagos y planes · reports: reportes. */
export type ClubPermission = "members" | "structure" | "dues" | "reports";

export const CLUB_ROLES: Record<ClubRole, { label: string; description: string; permissions: readonly ClubPermission[] }> = {
  admin: { label: "Administrador/a", description: "Socios, solicitudes, categorías, divisiones, cuotas, planes y reportes.", permissions: ["members", "structure", "dues", "reports"] },
  treasurer: { label: "Tesorero/a", description: "Cuotas, pagos, planes de cobro y reportes. Ve los socios pero no los edita.", permissions: ["dues", "reports"] },
  coordinator: { label: "Coordinador/a", description: "Socios, solicitudes, categorías y divisiones. No ve cobros ni reportes.", permissions: ["members", "structure"] },
  viewer: { label: "Solo lectura", description: "Ve socios, categorías y cuotas, pero no cambia nada.", permissions: [] },
};

export const CLUB_ROLE_ORDER: readonly ClubRole[] = ["admin", "treasurer", "coordinator", "viewer"];

export const CLUB_PERMISSION_LABELS: Record<ClubPermission, string> = {
  members: "editar socios y solicitudes", structure: "editar categorías y divisiones", dues: "gestionar cuotas, pagos y planes", reports: "ver los reportes",
};

export function isClubRole(value: unknown): value is ClubRole {
  return typeof value === "string" && value in CLUB_ROLES;
}

/** role null = dueño/admin de la organización (puede todo). */
export function clubCan(role: ClubRole | null | undefined, permission: ClubPermission) {
  return role ? CLUB_ROLES[role].permissions.includes(permission) : true;
}
