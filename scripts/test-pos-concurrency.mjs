import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Faltan variables locales de Supabase.");
const hostname = new URL(url).hostname;
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error("Esta prueba destructiva solo puede ejecutarse contra Supabase Local.");
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const rawSession = randomBytes(32).toString("base64url");
const sessionHash = hash(rawSession);
const fingerprintHash = hash(randomUUID());
const idempotencyKey = randomUUID();

const { data: activation, error: activationError } = await supabase.rpc("activate_pos_device", {
  target_pin: "481920",
  target_session_hash: sessionHash,
  target_fingerprint_hash: fingerprintHash,
});
if (activationError || activation?.[0]?.activation_status !== "ok") throw new Error("No se pudo activar el dispositivo demo.");

const { error: openError } = await supabase.rpc("open_pos_session", {
  target_session_hash: sessionHash,
  target_opening_cash_amount: 0,
  target_operator_label: "Concurrency test",
});
if (openError) throw openError;

const request = () => supabase.rpc("finalize_pos_sale", {
  target_session_hash: sessionHash,
  target_idempotency_key: idempotencyKey,
  target_items: [{ event_product_id: "f6000000-0000-4000-8000-000000000301", quantity: 1 }],
  target_payment_method: "cash",
  target_cash_received_amount: 1000000,
  target_external_reference: null,
});
const attempts = await Promise.all(Array.from({ length: 20 }, request));
const failures = attempts.filter(({ error }) => error);
const orderIds = new Set(attempts.flatMap(({ data }) => data?.map((row) => row.order_id) ?? []));
if (failures.length || orderIds.size !== 1) throw new Error(`La idempotencia falló: ${failures.length} errores, ${orderIds.size} orders.`);

const [{ count: orderCount }, { count: paymentCount }, { count: movementCount }] = await Promise.all([
  supabase.from("orders").select("id", { count: "exact", head: true }).eq("pos_idempotency_key", idempotencyKey),
  supabase.from("payments").select("id", { count: "exact", head: true }).eq("idempotency_key", idempotencyKey),
  supabase.from("pos_cash_movements").select("id", { count: "exact", head: true }).eq("order_id", [...orderIds][0]),
]);
if (orderCount !== 1 || paymentCount !== 1 || movementCount !== 1) {
  throw new Error(`Persistencia duplicada: orders=${orderCount}, payments=${paymentCount}, movements=${movementCount}.`);
}
console.log("POS concurrency: 20 retries, 1 Order, 1 Payment, 1 cash movement.");
