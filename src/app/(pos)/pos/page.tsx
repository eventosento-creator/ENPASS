import { getCurrentBoxOfficeState, getCurrentPosCatalog, getCurrentPosCashSummary, getPosSessionState } from "@/modules/pos/application/pos-api";
import { PosShell } from "@/modules/pos/ui/pos-shell";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const state = await getPosSessionState();
  const session = state.status === "active" ? state.session : null;
  const [catalog, cashSummary, boxOffice] = session ? await Promise.all([getCurrentPosCatalog(), getCurrentPosCashSummary(), getCurrentBoxOfficeState()]) : [[], null, null];
  return <PosShell initialSession={session} initialUnavailable={state.status === "unavailable"} initialCatalog={catalog} initialCashSummary={cashSummary} initialBoxOffice={boxOffice}/>;
}
