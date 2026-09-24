import { NextRequest, NextResponse } from "next/server";
import { processPendingInvoices } from "@/modules/billing/application/process-invoices";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await processPendingInvoices({ limit: 50 }));
}
