import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase environment is required.");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const hash = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const rawSession = randomBytes(32).toString("base64url");
const { data: activation, error: activationError } = await admin.rpc("activate_scanner_device", {
  target_pin: "320000",
  target_session_hash: hash(rawSession),
  target_fingerprint_hash: hash(`concurrency-${randomUUID()}`),
});
if (activationError || activation?.[0]?.activation_status !== "ok") throw new Error("Reset the local database before the concurrency test.");

const args = () => ({
  target_session_hash: hash(rawSession),
  target_qr_hash: hash(`NLOS1:${"A".repeat(43)}`),
  target_idempotency_key: randomUUID(),
});
const [first, second] = await Promise.all([
  admin.rpc("check_in_ticket", args()),
  admin.rpc("check_in_ticket", args()),
]);
if (first.error || second.error) throw new Error("Concurrent RPC execution failed.");
const results = [first.data?.[0]?.result, second.data?.[0]?.result].sort();
if (results.join(",") !== "already_used,valid") throw new Error(`Unexpected concurrency invariant: ${results.join(",")}`);
process.stdout.write("Concurrent check-in invariant passed: one valid, one already_used.\n");
