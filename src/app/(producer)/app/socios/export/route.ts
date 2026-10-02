import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/database/server";
import { getCurrentOrganization } from "@/modules/organizations/application/queries";
import { isClubEnabled } from "@/modules/clubs/application/queries";
import { MEMBERS_CSV_HEADERS, toCsv } from "@/modules/clubs/domain/members-csv";
import { slugify } from "@/shared/lib/format";

// Exporta el padrón en la misma estructura que acepta la importación (sirve también de plantilla
// con ?plantilla=1). Solo owner/admin: es un volcado masivo de datos personales.
export async function GET(request: NextRequest) {
  const org = await getCurrentOrganization();
  if (!org || !["owner", "admin"].includes(org.role) || !(await isClubEnabled(org.id))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows: string[][] = [[...MEMBERS_CSV_HEADERS]];
  if (!request.nextUrl.searchParams.has("plantilla")) {
    const supabase = await createClient();
    const [{ data: memberships }, { data: categories }, { data: enrollments }] = await Promise.all([
      supabase.from("memberships").select("member_number, customer_id, membership_category_id, id").eq("organization_id", org.id).order("member_number"),
      supabase.from("membership_categories").select("id, name").eq("organization_id", org.id),
      supabase.from("membership_division_enrollments").select("membership_id, divisions(name)").eq("organization_id", org.id).eq("status", "active"),
    ]);
    const customerIds = (memberships ?? []).map((membership) => membership.customer_id);
    const { data: customers } = customerIds.length
      ? await supabase.from("customers").select("id, first_name, last_name, email, phone, document").in("id", customerIds)
      : { data: [] };
    const categoryName = new Map((categories ?? []).map((category) => [category.id, category.name]));
    const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
    const divisionsByMembership = new Map<string, string[]>();
    for (const enrollment of enrollments ?? []) {
      const name = (enrollment.divisions as unknown as { name: string } | null)?.name;
      if (name) divisionsByMembership.set(enrollment.membership_id, [...(divisionsByMembership.get(enrollment.membership_id) ?? []), name]);
    }
    for (const membership of memberships ?? []) {
      const customer = customerById.get(membership.customer_id);
      rows.push([
        membership.member_number, customer?.first_name ?? "", customer?.last_name ?? "", customer?.document ?? "",
        customer?.email ?? "", customer?.phone ?? "", categoryName.get(membership.membership_category_id) ?? "",
        (divisionsByMembership.get(membership.id) ?? []).join("; "),
      ]);
    }
  }
  const filename = `socios-${slugify(org.name) || "club"}${request.nextUrl.searchParams.has("plantilla") ? "-plantilla" : ""}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
