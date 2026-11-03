import "server-only";

import { cookies } from "next/headers";

// Espacio (organización) que la persona eligió ver cuando tiene acceso a más de uno
// (ej. su propio club + un club donde es colaboradora).
const WORKSPACE_COOKIE = "workspace_org";

export async function getPreferredWorkspaceId() {
  return (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
}

export async function setPreferredWorkspaceId(organizationId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

// Panel que se está viendo en un espacio que tiene club y eventos a la vez: "events" (por defecto) o "club".
const PANEL_COOKIE = "workspace_panel";

export async function getPreferredPanel() {
  return (await cookies()).get(PANEL_COOKIE)?.value === "club" ? "club" : "events";
}

export async function setPreferredPanel(panel: "club" | "events") {
  (await cookies()).set(PANEL_COOKIE, panel, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}
