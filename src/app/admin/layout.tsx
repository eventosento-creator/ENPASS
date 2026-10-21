import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { logout } from "@/modules/identity/application/actions";
import { isPlatformAdmin } from "@/modules/organizations/application/queries";
import { AdminNavigation } from "@/modules/admin/ui/admin-navigation";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export const metadata: Metadata = { title: "Admin · ENPASS", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/admin");
  if (!(await isPlatformAdmin())) notFound();
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("provider", "manual").eq("method", "bank_transfer").eq("status", "processing").not("transfer_proof_path", "is", null);
  return <div className="min-h-screen md:pl-60">
    <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-[var(--border)] bg-[var(--background-soft)] p-5 md:flex md:flex-col">
      <div className="flex items-center justify-between gap-2 px-2"><Link href={"/admin" as never}><EnpassLogo/></Link><ThemeToggle/></div>
      <p className="mt-6 px-3 text-xs font-black uppercase tracking-[.14em] text-amber-600">Administración</p>
      <div className="mt-3"><AdminNavigation transfersPending={count ?? 0}/></div>
      <div className="mt-auto border-t border-[var(--border)] pt-4">
        <Link href="/app" className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-neutral-500 hover:bg-[var(--surface-strong)]"><ArrowLeft size={16}/>Volver a mi panel</Link>
        <p className="mt-2 truncate px-3 text-xs text-neutral-500">{data.user.email}</p>
        <form action={logout}><button className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm text-neutral-500 hover:bg-[var(--surface-strong)]"><LogOut size={16}/>Cerrar sesión</button></form>
      </div>
    </aside>
    <header className="border-b border-[var(--border)] md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3"><Link href={"/admin" as never}><EnpassLogo compact/></Link><div className="flex items-center gap-1"><Link href="/app" className="rounded-xl px-3 py-2 text-xs font-bold text-neutral-500">Mi panel</Link><ThemeToggle/></div></div>
      <AdminNavigation mobile transfersPending={count ?? 0}/>
    </header>
    <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">{children}</main>
  </div>;
}
