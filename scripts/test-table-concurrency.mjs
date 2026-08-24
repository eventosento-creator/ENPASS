import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase environment is required.");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tableId = "e5000000-0000-4000-8000-000000000202";
const { data: oldHolds, error: holdReadError } = await admin.from("table_holds").select("id, order_id").eq("event_table_id", tableId).eq("status", "active");
if (holdReadError) throw holdReadError;
if (oldHolds?.length) {
  const { error: expireError } = await admin.from("table_holds").update({ status: "expired" }).in("id", oldHolds.map((hold) => hold.id));
  if (expireError) throw expireError;
  const { error: orderError } = await admin.from("orders").update({ status: "expired" }).in("id", oldHolds.map((hold) => hold.order_id)).eq("status", "pending");
  if (orderError) throw orderError;
}

const checkout = (label) => admin.rpc("create_guest_checkout_attributed", {
  target_event: "44444444-4444-4444-8444-444444444444",
  buyer_first_name: "Concurrency",
  buyer_last_name: label,
  buyer_email: `table-concurrency-${label}-${randomUUID()}@example.invalid`,
  buyer_phone: "",
  buyer_document: "",
  selections: [{ item_type: "table", item_id: tableId, quantity: 1 }],
  target_attribution_session_hash: null,
});

const [first, second] = await Promise.all([checkout("a"), checkout("b")]);
const results = [first, second];
const successes = results.filter((result) => !result.error && result.data?.length === 1);
const rejected = results.filter((result) => result.error?.message.includes("TABLE_UNAVAILABLE"));
if (successes.length !== 1 || rejected.length !== 1) {
  const errors = results.map((result) => result.error?.message ?? "no data").join(" | ");
  throw new Error(`Unexpected table concurrency invariant: successes=${successes.length}, rejected=${rejected.length}; ${errors}`);
}
process.stdout.write("Concurrent table hold invariant passed: one hold, one TABLE_UNAVAILABLE.\n");
