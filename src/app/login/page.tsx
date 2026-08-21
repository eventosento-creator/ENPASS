import type { Metadata } from "next";
import { AuthForms } from "@/modules/identity/ui/auth-forms";
import { safeProducerPath } from "@/shared/lib/navigation";

export const metadata: Metadata = { title: "Ingresar" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const query = await searchParams;
  const initialMode = query.mode === "register" || query.mode === "magic" ? query.mode : "login";
  return <main className="container-shell grid min-h-screen place-items-center py-10"><AuthForms initialMode={initialMode} nextPath={safeProducerPath(query.next)}/></main>;
}
