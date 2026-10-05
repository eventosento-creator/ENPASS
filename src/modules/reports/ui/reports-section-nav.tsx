import Link from "next/link";

// Arquitectura lista para escalar: hoy solo existe "General"; el resto aparece como próximamente.
const sections = [
  { key: "general", label: "General", href: "/app/reportes" },
  { key: "sales", label: "Ventas" }, { key: "tickets", label: "Entradas" }, { key: "rrpp", label: "RRPP" },
  { key: "clients", label: "Clientes" }, { key: "access", label: "Accesos" }, { key: "box-office", label: "Taquilla" },
] as const;

export function ReportsSectionNav({ active = "general" }: { active?: string }) {
  return <nav aria-label="Secciones de reportes" className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
    {sections.map((section) => "href" in section
      ? <Link key={section.key} href={section.href as never} aria-current={active === section.key ? "page" : undefined} className={`relative min-h-10 shrink-0 px-3.5 py-2.5 text-sm font-bold transition ${active === section.key ? "text-[var(--text)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>{section.label}</Link>
      : <span key={section.key} aria-disabled="true" title="Próximamente" className="min-h-10 shrink-0 cursor-not-allowed px-3.5 py-2.5 text-sm font-bold text-[var(--muted)] opacity-50">{section.label}</span>)}
  </nav>;
}
