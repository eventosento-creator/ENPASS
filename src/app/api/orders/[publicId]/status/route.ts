import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/shared/database/server";

const publicIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

export async function GET(_: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const parsed = publicIdSchema.safeParse((await params).publicId);
  if (!parsed.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_order", { target_public_id: parsed.data });
  const order = data?.[0];
  if (error || !order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    orderStatus: order.status,
    paymentStatus: order.payment_status,
    paymentUpdatedAt: order.payment_updated_at,
    expiresAt: order.expires_at,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
