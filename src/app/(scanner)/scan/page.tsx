import { getCurrentScannerSession } from "@/modules/access/application/scanner-session";
import { ScannerShell } from "@/modules/access/ui/scanner-shell";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const session = await getCurrentScannerSession();
  return <ScannerShell initialSession={session} developmentMode={process.env.NODE_ENV !== "production"}/>;
}
