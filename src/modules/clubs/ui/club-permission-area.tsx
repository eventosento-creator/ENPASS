import { CLUB_PERMISSION_LABELS, CLUB_ROLES, clubCan, type ClubPermission, type ClubRole } from "../domain/club-roles";

/** Muestra el contenido normal si el rol tiene el permiso; si no, lo deja visible pero deshabilitado con un aviso.
 *  (La base de datos también lo bloquea: esto es solo para que no haya botones que fallen.) */
export function ClubPermissionArea({ role, permission, quiet = false, children }: { role: ClubRole | null; permission: ClubPermission; quiet?: boolean; children: React.ReactNode }) {
  if (clubCan(role, permission)) return <>{children}</>;
  return <>
    {!quiet && <p className="mt-6 rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-neutral-500">Con tu cargo ({role ? CLUB_ROLES[role].label : ""}) no podés {CLUB_PERMISSION_LABELS[permission]}. Lo ves en modo lectura.</p>}
    <fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-60">{children}</fieldset>
  </>;
}
