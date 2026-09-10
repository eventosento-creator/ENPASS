import { notFound } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { LegalDocumentPage } from "@/modules/legal/ui/legal-document-page";

export default async function TerminosPage() {
  const supabase = await createClient();
  const { data: document } = await supabase.rpc("get_active_legal_document", { target_type: "terms_buyer" });
  if (!document) notFound();
  return <LegalDocumentPage document={document}/>;
}
