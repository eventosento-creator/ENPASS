import Link from "next/link";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { getMembershipRequests } from "../application/queries";
import { clubCan, type ClubPermission } from "../domain/club-roles";

type SectionKey = "socios" | "solicitudes" | "categorias" | "divisiones" | "membresias" | "reportes" | "acceso" | "equipo" | "ajustes";

// Cuatro secciones principales; las que tienen varias pantallas muestran una segunda fila.
const groups = [
  { key: "socios", label: "Socios", href: "/app/socios", ownerOnly: false, permission: null, children: [
    { key: "socios", label: "Listado", href: "/app/socios" },
    { key: "solicitudes", label: "Solicitudes", href: "/app/socios/solicitudes" },
  ] },
  { key: "planes", label: "Planes y precios", href: "/app/socios/categorias", ownerOnly: false, permission: null, children: [
    { key: "categorias", label: "Categorías", href: "/app/socios/categorias" },
    { key: "divisiones", label: "Divisiones", href: "/app/socios/divisiones" },
    { key: "membresias", label: "Membresías", href: "/app/socios/membresias" },
  ] },
  { key: "reportes", label: "Reportes", href: "/app/socios/reportes", ownerOnly: false, permission: "reports", children: [] },
  { key: "config", label: "Ajustes", href: "/app/socios/ajustes", ownerOnly: true, permission: null, children: [
    { key: "ajustes", label: "Datos del club", href: "/app/socios/ajustes" },
    { key: "acceso", label: "Acceso", href: "/app/socios/acceso" },
    { key: "equipo", label: "Equipo", href: "/app/socios/equipo" },
  ] },
] as const satisfies readonly { key: string; label: string; href: string; ownerOnly: boolean; permission: ClubPermission | null; children: readonly { key: string; label: string; href: string }[] }[];

function groupOf(active: SectionKey) {
  if (active === "socios" || active === "solicitudes") return "socios";
  if (active === "categorias" || active === "divisiones" || active === "membresias") return "planes";
  if (active === "reportes") return "reportes";
  return "config";
}

export async function ClubSectionNav({ active }: { active: SectionKey }) {
  const organization = await getCurrentOrganization();
  // Los colaboradores del club (staff) no ven la configuración (es del dueño/admin) y solo ven Reportes si su rol lo permite.
  const visible = groups.filter((group) => organization?.role !== "staff" || (!group.ownerOnly && (!group.permission || clubCan(organization.clubRole, group.permission))));
  const activeGroup = groupOf(active);
  const current = visible.find((group) => group.key === activeGroup);
  const pendingRequests = organization
    ? (await getMembershipRequests(organization.id).catch(() => [])).filter((request) => request.status === "pending").length
    : 0;

  return <div className="mt-7">
    <nav aria-label="Secciones del club" className="flex gap-1 overflow-x-auto border-b border-white/[.07]">
      {visible.map((group) => {
        const selected = group.key === activeGroup;
        return <Link aria-current={selected ? "page" : undefined} className={`relative min-h-11 shrink-0 px-2 py-3 text-[13px] font-bold transition sm:px-4 sm:text-sm ${selected ? "text-white after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-neutral-500 hover:text-white"}`} href={group.href as never} key={group.key}>
          {group.label}
          {group.key === "socios" && pendingRequests > 0 && !selected ? <span className="ml-2 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black text-black">{pendingRequests}</span> : null}
        </Link>;
      })}
    </nav>
    {current && current.children.length > 0 ? <nav aria-label={current.label} className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {current.children.map((child) => {
        const selected = child.key === active;
        return <Link aria-current={selected ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition ${selected ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-white/10 text-neutral-400 hover:text-white"}`} href={child.href as never} key={child.key}>
          {child.label}
          {child.key === "solicitudes" && pendingRequests > 0 ? <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black text-black">{pendingRequests}</span> : null}
        </Link>;
      })}
    </nav> : null}
  </div>;
}
