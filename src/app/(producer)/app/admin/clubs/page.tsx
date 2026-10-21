import { redirect } from "next/navigation";

// El área de administración ahora vive en /admin.
export default function LegacyAdminRedirect() {
  redirect("/admin/clubes/gestion" as never);
}
