import { redirect } from "next/navigation";
import { createClient } from "@/shared/database/server";
import { acceptEventCollaboratorInvitation } from "@/modules/collaborators/application/access";

export default async function AcceptCollaboratorInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/login");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/aceptar?token=${token}`)}`);

  const eventId = await acceptEventCollaboratorInvitation(token);
  if (!eventId) return <main className="grid min-h-dvh place-items-center px-4"><div className="card max-w-md p-8 text-center"><h1 className="text-xl font-black">Invitación no válida</h1><p className="mt-3 text-sm text-neutral-500">El enlace venció o ya fue utilizado. Pedile al organizador que te invite de nuevo.</p></div></main>;
  redirect(`/app/events/${eventId}`);
}
