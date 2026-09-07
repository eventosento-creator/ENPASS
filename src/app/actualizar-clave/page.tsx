import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { UpdatePasswordForm } from "@/modules/identity/ui/update-password-form";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export const metadata: Metadata = { title: "Actualizar contraseña" };

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=recover&authError=invalid-link");
  return <main className="container-shell grid min-h-screen grid-rows-[auto_1fr] py-5 sm:py-10">
    <header className="flex items-center justify-between"><Link href="/login" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-white"><ChevronLeft size={17}/>Volver</Link><div className="flex items-center gap-2"><Link href="/"><EnpassLogo/></Link><ThemeToggle/></div></header>
    <div className="grid place-items-center py-8"><section className="card w-full max-w-md p-5 sm:p-8"><p className="eyebrow">Seguridad</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em]">Elegí una contraseña nueva</h1><p className="mt-3 text-sm leading-6 text-neutral-500">Usá al menos 8 caracteres. Al guardarla vas a volver al inicio de sesión.</p><UpdatePasswordForm/></section></div>
  </main>;
}
