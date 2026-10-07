import { NextRequest, NextResponse } from "next/server";
import { getWorkspaces } from "@/modules/organizations/application/queries";
import { setPreferredWorkspaceId } from "@/modules/organizations/infrastructure/workspace";

// Tras aceptar una invitación al club: deja elegido ese espacio (si la persona ya tenía el suyo, no queda en el equivocado).
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("org") ?? "";
  const workspaces = await getWorkspaces();
  if (workspaces.some((workspace) => workspace.organization.id === organizationId)) await setPreferredWorkspaceId(organizationId);
  return NextResponse.redirect(new URL("/app/socios", request.url));
}
