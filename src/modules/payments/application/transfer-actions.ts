"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/shared/database/admin";
import { allowRequest, getClientIp } from "@/shared/lib/rate-limit";
import { paymentLog } from "@/shared/lib/structured-log";
import { notifyTransferReviewRequested } from "./transfer-notices";

const publicIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** El comprador eligió pagar por transferencia: se crea el intento y se estira la reserva. */
export async function startTransferPayment(formData: FormData) {
  const parsed = publicIdSchema.safeParse(formData.get("orderPublicId"));
  if (!parsed.success) redirect("/?paymentError=invalid_order");
  if (!(await allowRequest("transfer_start_ip", await getClientIp(), 30, 3600))) redirect(`/order/${parsed.data}?paymentError=rate_limited`);
  const { error } = await createAdminClient().rpc("start_transfer_payment", { target_order_public_id: parsed.data });
  if (error) redirect(`/order/${parsed.data}?paymentError=${transferErrorCode(error.message)}`);
  redirect(`/order/${parsed.data}?metodo=transferencia`);
}

/** El comprador sube el comprobante: la orden pasa a revisión de ENPASS. */
export async function submitTransferProof(formData: FormData) {
  const parsed = publicIdSchema.safeParse(formData.get("orderPublicId"));
  if (!parsed.success) redirect("/?paymentError=invalid_order");
  const orderId = parsed.data;
  const back: (code: string) => never = (code) => redirect(`/order/${orderId}?metodo=transferencia&paymentError=${code}`);
  if (!(await allowRequest("transfer_proof_ip", await getClientIp(), 20, 3600))) back("rate_limited");

  // Las compras por transferencia no admiten devolución: el comprador lo tiene que aceptar de forma expresa.
  if (formData.get("acceptNoRefund") !== "on") back("accept_no_refund");

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) back("proof_required");
  const proof = file as File;
  const extension = PROOF_TYPES[proof.type];
  if (!extension) back("proof_type");
  if (proof.size > MAX_PROOF_BYTES) back("proof_size");
  const bytes = new Uint8Array(await proof.arrayBuffer());
  if (!matchesFileType(bytes, extension)) back("proof_type");

  const admin = createAdminClient();
  const path = `${orderId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("transfer-proofs").upload(path, bytes, { contentType: proof.type, upsert: false });
  if (uploadError) { paymentLog("transfer.proof.upload_failed", { orderId }); back("proof_upload"); }
  const { error } = await admin.rpc("submit_transfer_proof", { target_order_public_id: orderId, target_proof_path: path });
  if (error) {
    await admin.storage.from("transfer-proofs").remove([path]);
    back(transferErrorCode(error.message));
  }
  paymentLog("transfer.proof.submitted", { orderId });
  await notifyTransferReviewRequested(orderId);
  redirect(`/order/${orderId}?metodo=transferencia`);
}

// Verifica los primeros bytes: el tipo que declara el navegador no alcanza.
function matchesFileType(bytes: Uint8Array, extension: string) {
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (extension === "jpg") return startsWith(0xff, 0xd8, 0xff);
  if (extension === "png") return startsWith(0x89, 0x50, 0x4e, 0x47);
  if (extension === "pdf") return startsWith(0x25, 0x50, 0x44, 0x46);
  if (extension === "webp") return startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

function transferErrorCode(message: string) {
  if (message.includes("TRANSFER_NOT_AVAILABLE")) return "transfer_not_available";
  if (message.includes("PAYMENT_IN_PROGRESS")) return "payment_in_progress";
  if (message.includes("HOLD_EXPIRED") || message.includes("ORDER_NOT_PAYABLE")) return "hold_expired";
  if (message.includes("TRANSFER_NOT_STARTED")) return "transfer_not_started";
  return "payment_unavailable";
}
