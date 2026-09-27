import { getScannerSessionState } from "@/modules/access/application/scanner-session";
import { ScannerShell } from "@/modules/access/ui/scanner-shell";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const state = await getScannerSessionState();
  return <ScannerShell initialSession={state.status === "active" ? state.session : null} initialUnavailable={state.status === "unavailable"} developmentMode={process.env.NODE_ENV !== "production"}/>;
}
