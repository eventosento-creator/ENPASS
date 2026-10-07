import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/shared/database/server";
import { logout } from "@/modules/identity/application/actions";
import { WorkspaceSwitcher } from "@/modules/organizations/ui/workspace-switcher";
import { ProducerNavigation } from "@/modules/organizations/ui/producer-navigation";
import { getCollaboratorEventIds, getCurrentOrganization, getWorkspaces, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { getAdminViewOrgId } from "@/modules/organizations/infrastructure/admin-view";
import { exitAdminView } from "@/modules/organizations/application/admin-actions";
import { isClubEnabled } from "@/modules/clubs/application/queries";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export default async function ProducerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const [organization, admin, adminViewOrgId, workspaces] = await Promise.all([getCurrentOrganization(), isPlatformAdmin(), getAdminViewOrgId(), getWorkspaces()]);
  // Si tiene acceso a más de un espacio (ej. su club + un club donde colabora), puede cambiar entre ellos.
  const switcherOptions = workspaces.length > 1 ? workspaces.map((workspace) => ({ id: workspace.organization.id, name: workspace.organization.name, staff: workspace.role === "staff" })) : null;
  const collaboratorOnly = !organization && (await getCollaboratorEventIds()).length > 0;
  const clubStaffOnly = organization?.role === "staff";
  const clubEnabled = organization ? await isClubEnabled(organization.id) : false;
  const workspaceLabel = organization?.name ?? (collaboratorOnly ? "Panel de colaborador" : "Creá tu evento");
  const profileName = typeof data.user.user_metadata.full_name === "string" && data.user.user_metadata.full_name.trim()
    ? data.user.user_metadata.full_name.trim() : data.user.email;
  const impersonating = admin && !!adminViewOrgId;
  return <div className="min-h-screen pb-24 md:pb-0 md:pl-60">
    {impersonating && <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-xs font-bold text-black md:pl-60"><ShieldCheck size={14}/>Viendo como {organization?.name} (modo admin)<form action={exitAdminView}><button className="underline">Salir</button></form></div>}
    <aside className={`fixed inset-y-0 left-0 hidden w-60 border-r border-[var(--border)] bg-[var(--background-soft)] p-5 md:flex md:flex-col ${impersonating ? "pt-12" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-2"><Link href="/app"><EnpassLogo/></Link><ThemeToggle/></div>
      <p className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-neutral-600">Tu espacio</p>{switcherOptions && organization && !impersonating ? <div className="mt-1 px-1"><WorkspaceSwitcher currentId={organization.id} options={switcherOptions}/></div> : <p className="mt-1 truncate px-3 text-lg font-black tracking-[-.03em]">{workspaceLabel}</p>}<div className="mt-8"><ProducerNavigation collaboratorOnly={collaboratorOnly} clubEnabled={clubEnabled} clubStaffOnly={clubStaffOnly}/></div>
      {admin && <Link href={"/app/admin/organizations" as never} className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-amber-500 transition hover:bg-white/[.04]"><ShieldCheck size={15}/>Todas las cuentas</Link>}
      <div className="mt-auto border-t border-white/[.07] pt-4"><p className="truncate px-3 text-xs font-semibold text-neutral-500">{profileName}</p><form action={logout} className="mt-1"><button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 transition hover:bg-white/[.04] hover:text-white"><LogOut size={16}/> Cerrar sesión</button></form></div>
    </aside>
    <header className={`flex items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3 md:hidden ${impersonating ? "mt-9" : ""}`}><Link href="/app"><EnpassLogo compact/></Link>{switcherOptions && organization && !impersonating ? <div className="min-w-0 flex-1"><WorkspaceSwitcher currentId={organization.id} options={switcherOptions} compact/></div> : <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-neutral-500">{workspaceLabel}</span>}<ThemeToggle/><form action={logout}><button type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-11 place-items-center rounded-full border border-[var(--border)] text-neutral-500 transition hover:text-[var(--text)]"><LogOut size={18}/></button></form></header>
    <main className="container-shell py-7 sm:py-10">{children}</main>
    {!collaboratorOnly && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[.08] bg-[color:var(--background-soft)]/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><ProducerNavigation mobile clubEnabled={clubEnabled} clubStaffOnly={clubStaffOnly}/></div>}
  </div>;
}
