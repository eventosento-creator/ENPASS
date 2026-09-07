import { getCurrentPosCatalog, getCurrentPosCashSummary, getCurrentPosSession } from "@/modules/pos/application/pos-api";
import { PosShell } from "@/modules/pos/ui/pos-shell";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getCurrentPosSession();
  const [catalog, cashSummary] = session ? await Promise.all([getCurrentPosCatalog(), getCurrentPosCashSummary()]) : [[], null];
  return <PosShell initialSession={session} initialCatalog={catalog} initialCashSummary={cashSummary}/>;
}
