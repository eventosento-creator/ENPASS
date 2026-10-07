import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { acceptClubStaffInvitation } from "@/modules/clubs/application/team";

export default async function AcceptClubInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/login");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/club?token=${token}`)}`);

  const organizationId = await acceptClubStaffInvitation(token);
  if (!organizationId) return <main className="grid min-h-dvh place-items-center px-4"><div className="card max-w-md p-8 text-center"><h1 className="text-xl font-black">Invitación no válida</h1><p className="mt-3 text-sm text-neutral-500">El enlace venció, ya fue usado o estás ingresando con otro email distinto al invitado ({user.email}). Pedile al club que te invite de nuevo.</p></div></main>;
  redirect("/app/socios");
}
