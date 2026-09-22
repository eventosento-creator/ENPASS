import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAllOrganizationsForAdmin, isPlatformAdmin } from "@/modules/organizations/application/queries";
import { viewOrganizationAsAdmin } from "@/modules/organizations/application/admin-actions";

export default async function AdminOrganizationsPage() {
  if (!(await isPlatformAdmin())) notFound();
  const organizations = await getAllOrganizationsForAdmin();
  return <>
    <header className="flex items-center gap-2"><ShieldCheck className="text-[var(--accent)]" size={22}/><h1 className="page-title">Todas las organizaciones</h1></header>
    <p className="mt-2 text-sm text-neutral-500">Acceso de super-admin. Elegí una organización para ver su panel completo.</p>
    <div className="mt-8 grid gap-3">
      {organizations.map((organization) => <form key={organization.id} action={viewOrganizationAsAdmin} className="card flex items-center justify-between gap-4 p-4">
        <input type="hidden" name="organizationId" value={organization.id}/>
        <div><p className="font-bold">{organization.name}</p><p className="text-xs text-neutral-500">{organization.slug}</p></div>
        <button className="btn btn-secondary min-h-9 px-4 text-xs">Ver panel</button>
      </form>)}
      {!organizations.length && <p className="text-sm text-neutral-500">No hay organizaciones todavía.</p>}
    </div>
  </>;
}
