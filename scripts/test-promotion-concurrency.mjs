// Prueba de concurrencia real contra la base local: 12 compradores simultáneos intentan canjear un cupón de 3 usos.
// Invariante: exactamente 3 canjes y 9 rechazos CODE_EXHAUSTED; nunca más usos que el máximo.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase environment is required.");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const organizationId = "22222222-2222-4222-8222-222222222222";
const eventId = "44444444-4444-4444-8444-444444444444";
const ticketTypeId = "55555555-5555-4555-8555-555555555551";
const MAX_USES = 3;
const BUYERS = 12;
const code = `CONC${Date.now().toString(36).toUpperCase().slice(-8)}`;

const publicClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const legalId = async (type) => { const { data } = await publicClient.rpc("get_active_legal_document", { target_type: type }); return Array.isArray(data) ? data[0]?.id : data?.id; };
const terms = await legalId("terms_buyer");
const refund = await legalId("refund_policy");
if (!terms || !refund) throw new Error("Faltan los documentos legales activos.");

const { data: promotion, error: promotionError } = await admin.from("promotions").insert({
  organization_id: organizationId, name: "Concurrencia", code, kind: "percent", percent_bps: 1000, max_total_uses: MAX_USES, all_events: false,
}).select("id").single();
if (promotionError) throw promotionError;
await admin.from("promotion_events").insert({ promotion_id: promotion.id, event_id: eventId });

const checkout = (n) => admin.rpc("create_guest_checkout_promoted", {
  target_event: eventId, buyer_first_name: "Conc", buyer_last_name: String(n),
  buyer_email: `promo-conc-${n}-${randomUUID()}@example.invalid`, buyer_phone: "", buyer_document: "",
  selections: [{ item_type: "ticket", item_id: ticketTypeId, quantity: 1 }], target_attribution_session_hash: null,
  accepted_terms_document_id: terms, accepted_refund_policy_document_id: refund, target_promotion_code: code,
});

const results = await Promise.all(Array.from({ length: BUYERS }, (_, n) => checkout(n)));
const successes = results.filter((r) => !r.error && r.data?.length === 1);
const exhausted = results.filter((r) => r.error?.message.includes("CODE_EXHAUSTED"));
const others = results.filter((r) => r.error && !r.error.message.includes("CODE_EXHAUSTED")).map((r) => r.error.message);
const { count: reserved } = await admin.from("promotion_redemptions").select("id", { count: "exact", head: true }).eq("promotion_id", promotion.id).eq("status", "reserved");

// Limpieza: se liberan las reservas del cupón de prueba y se borra.
const { data: redemptions } = await admin.from("promotion_redemptions").select("order_id").eq("promotion_id", promotion.id);
const orderIds = (redemptions ?? []).map((r) => r.order_id);
if (orderIds.length) {
  await admin.from("ticket_holds").update({ status: "expired" }).in("order_id", orderIds);
  await admin.from("orders").update({ status: "expired" }).in("id", orderIds);
}

await admin.from("promotion_redemptions").delete().eq("promotion_id", promotion.id);
await admin.from("promotions").delete().eq("id", promotion.id);

if (successes.length !== MAX_USES || exhausted.length !== BUYERS - MAX_USES || reserved !== MAX_USES || others.length) {
  throw new Error(`Invariante roto: canjes=${successes.length}/${MAX_USES}, agotados=${exhausted.length}/${BUYERS - MAX_USES}, reservados=${reserved}, otros errores=${others.join(" | ") || "ninguno"}`);
}
process.stdout.write(`Concurrencia de cupones OK: ${BUYERS} compradores simultáneos, ${MAX_USES} canjes, ${exhausted.length} rechazados por CODE_EXHAUSTED.\n`);
