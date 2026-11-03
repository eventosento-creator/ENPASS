import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { logout } from "@/modules/identity/application/actions";
import { WorkspaceSwitcher } from "@/modules/organizations/ui/workspace-switcher";
import { ProducerNavigation } from "@/modules/organizations/ui/producer-navigation";
import { getActivePanel, getAuthUser, getCollaboratorEventIds, getCurrentOrganization, getWorkspaces, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { getAdminViewOrgId } from "@/modules/organizations/infrastructure/admin-view";
import { exitAdminView } from "@/modules/organizations/application/admin-actions";
import { PanelSwitch } from "@/modules/organizations/ui/panel-switch";
import { EnpassLogo } from "@/shared/ui/brand";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

export default async function ProducerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const [organization, admin, adminViewOrgId, workspaces] = await Promise.all([getCurrentOrganization(), isPlatformAdmin(), getAdminViewOrgId(), getWorkspaces()]);
  // Selector de espacio: el actual, los demás a los que tiene acceso (ej. un club donde colabora) y "Crear club".
  const switcherOptions = workspaces.map((workspace) => ({ id: workspace.organization.id, name: workspace.organization.name, role: workspace.role, logoUrl: workspace.logoUrl, kind: workspace.kind }));
  const collaboratorOnly = !organization && (await getCollaboratorEventIds()).length > 0;
  const clubStaffOnly = organization?.role === "staff";
  // Eventos y club son dos paneles distintos con su propio menú; el botón Eventos | Club pasa de uno a otro.
  const panel = organization ? await getActivePanel() : "events";
  const workspaceLabel = organization?.name ?? (collaboratorOnly ? "Panel de colaborador" : "Creá tu evento");
  const profileName = typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim() : user.email;
  const impersonating = admin && !!adminViewOrgId;
  const canSwitchPanel = !impersonating && workspaces.some((workspace) => workspace.kind !== "club") && workspaces.some((workspace) => workspace.kind !== "events");
  return <div className="min-h-screen pb-24 md:pb-0 md:pl-60 print:pb-0 print:pl-0">
    {impersonating && <div className="print:hidden fixed inset-x-0 top-0 z-30 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-xs font-bold text-black md:pl-60"><ShieldCheck size={14}/>Viendo como {organization?.name} (modo admin)<form action={exitAdminView}><button className="underline">Salir</button></form></div>}
    <aside className={`fixed inset-y-0 left-0 hidden w-60 print:!hidden border-r border-[var(--border)] bg-[var(--background-soft)] p-5 md:flex md:flex-col ${impersonating ? "pt-12" : ""}`}>
      <div className="flex items-center justify-between gap-2 px-2"><Link href="/app"><EnpassLogo/></Link><ThemeToggle/></div>
      <p className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-neutral-600">Tu espacio</p>{switcherOptions.length > 0 && organization && !impersonating ? <div className="mt-1 px-1"><WorkspaceSwitcher currentId={organization.id} options={switcherOptions}/></div> : <p className="mt-1 truncate px-3 text-lg font-black tracking-[-.03em]">{workspaceLabel}</p>}{canSwitchPanel && <div className="mt-3 px-1"><PanelSwitch active={panel}/></div>}<div className="mt-8"><ProducerNavigation collaboratorOnly={collaboratorOnly} clubOnly={panel === "club"} clubStaffOnly={clubStaffOnly}/></div>
      {admin && <Link href={"/admin" as never} className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-amber-500 transition hover:bg-white/[.04]"><ShieldCheck size={15}/>Administración</Link>}
      <div className="mt-auto border-t border-white/[.07] pt-4"><p className="truncate px-3 text-xs font-semibold text-neutral-500">{profileName}</p><form action={logout} className="mt-1"><button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 transition hover:bg-white/[.04] hover:text-white"><LogOut size={16}/> Cerrar sesión</button></form></div>
    </aside>
    <header className={`flex items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3 md:hidden print:hidden ${impersonating ? "mt-9" : ""}`}><Link href="/app"><EnpassLogo compact/></Link>{switcherOptions.length > 0 && organization && !impersonating ? <div className="min-w-0 flex-1"><WorkspaceSwitcher currentId={organization.id} options={switcherOptions} compact/></div> : <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-neutral-500">{workspaceLabel}</span>}<ThemeToggle/><form action={logout}><button type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-11 place-items-center rounded-full border border-[var(--border)] text-neutral-500 transition hover:text-[var(--text)]"><LogOut size={18}/></button></form></header>
    {canSwitchPanel && <div className="px-4 pt-3 md:hidden print:hidden"><PanelSwitch active={panel} compact/></div>}
    <main className="container-shell py-7 sm:py-10">{children}</main>
    {!collaboratorOnly && <div className="fixed inset-x-0 bottom-0 z-20 print:hidden border-t border-white/[.08] bg-[color:var(--background-soft)]/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><ProducerNavigation mobile clubOnly={panel === "club"} clubStaffOnly={clubStaffOnly}/></div>}
  </div>;
}
