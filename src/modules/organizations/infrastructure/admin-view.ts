import "server-only";

import { cookies } from "next/headers";

const ADMIN_VIEW_ORG_COOKIE = "admin_view_org";

export async function getAdminViewOrgId() {
  return (await cookies()).get(ADMIN_VIEW_ORG_COOKIE)?.value ?? null;
}

export async function setAdminViewOrgId(organizationId: string) {
  (await cookies()).set(ADMIN_VIEW_ORG_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminViewOrgId() {
  (await cookies()).set(ADMIN_VIEW_ORG_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
