import type { Metadata, Viewport } from "next";
import { getClubDoorSessionState } from "@/modules/clubs/application/club-door";
import { ClubDoorShell } from "@/modules/clubs/ui/club-door-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Puerta del club", description: "Control de ingreso de socios ENPASS", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#090909" };

export default async function ClubScanPage() {
  const state = await getClubDoorSessionState();
  return <main className="min-h-dvh bg-[var(--background)]"><ClubDoorShell initialSession={state.status === "active" ? state.session : null} initialUnavailable={state.status === "unavailable"}/></main>;
}
