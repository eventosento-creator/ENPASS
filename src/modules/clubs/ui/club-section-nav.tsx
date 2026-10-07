import Link from "next/link";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";

const items = [
  { href: "/app/socios", label: "Socios", key: "socios" },
  { href: "/app/socios/categorias", label: "Categorías", key: "categorias" },
  { href: "/app/socios/divisiones", label: "Divisiones", key: "divisiones" },
  { href: "/app/socios/solicitudes", label: "Solicitudes", key: "solicitudes" },
  { href: "/app/socios/reportes", label: "Reportes", key: "reportes" },
  { href: "/app/socios/acceso", label: "Acceso", key: "acceso" },
  { href: "/app/socios/equipo", label: "Equipo", key: "equipo" },
  { href: "/app/socios/ajustes", label: "Ajustes", key: "ajustes" },
] as const;

// Los colaboradores del club (staff) solo ven la gestión de socios; acceso, equipo y ajustes son del dueño/admin.
const ownerOnly = new Set(["acceso", "equipo", "ajustes"]);

export async function ClubSectionNav({ active }: { active: "socios" | "categorias" | "divisiones" | "solicitudes" | "reportes" | "acceso" | "equipo" | "ajustes" }) {
  const organization = await getCurrentOrganization();
  const visible = items.filter((item) => organization?.role !== "staff" || !ownerOnly.has(item.key));
  return <nav aria-label="Secciones del club" className="mt-7 flex gap-1 overflow-x-auto border-b border-white/[.07]">
    {visible.map(item => <Link aria-current={active === item.key ? "page" : undefined} className={`relative min-h-11 shrink-0 px-3 py-3 text-sm font-bold transition sm:px-4 ${active === item.key ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-neutral-500 hover:text-white"}`} href={item.href as never} key={item.key}>{item.label}</Link>)}
  </nav>;
}
