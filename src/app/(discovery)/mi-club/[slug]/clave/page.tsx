import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalClub } from "@/modules/clubs/application/member-portal";
import { MemberSetPasswordForm } from "@/modules/clubs/ui/member-set-password-form";

export const metadata: Metadata = { title: "Crear contraseña", robots: { index: false, follow: false } };

export default async function MemberPasswordPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string }> }) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const club = await getPortalClub(slug);
  if (!club) notFound();
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return <main className="container-shell max-w-md pb-16 pt-10">
    <p className="eyebrow">{club.brandName ?? club.name}</p>
    <h1 className="mt-2 text-3xl font-black tracking-[-.03em]">Creá tu contraseña</h1>
    {valid ? <><p className="mt-3 text-sm leading-6 text-neutral-500">Con esta contraseña vas a entrar a tu perfil de socio con tu DNI o tu mail.</p><MemberSetPasswordForm slug={slug} token={token}/></>
      : <p className="mt-4 text-sm text-neutral-500">Este link no es válido. <Link className="underline" href={`/mi-club/${slug}` as never}>Pedí uno nuevo desde el ingreso</Link>.</p>}
  </main>;
}
