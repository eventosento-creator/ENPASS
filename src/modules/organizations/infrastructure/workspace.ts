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
