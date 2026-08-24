import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AuthForms } from "@/modules/identity/ui/auth-forms";
import { safeProducerPath } from "@/shared/lib/navigation";

export const metadata: Metadata = { title: "Ingresar" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const query = await searchParams;
  const initialMode = query.mode === "register" || query.mode === "magic" ? query.mode : "login";
  return <main className="container-shell grid min-h-screen grid-rows-[auto_1fr] py-5 sm:py-10"><header className="flex items-center justify-between"><Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Volver</Link><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link></header><div className="grid place-items-center py-8"><AuthForms initialMode={initialMode} nextPath={safeProducerPath(query.next)}/></div></main>;
}
