"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus, PaymentStatus } from "@/shared/database/types";

export function PaymentStatusPoller({ publicId, initialOrderStatus, initialPaymentStatus }: { publicId: string; initialOrderStatus: OrderStatus; initialPaymentStatus: PaymentStatus | null }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(`${initialOrderStatus}:${initialPaymentStatus ?? "none"}`);
  const shouldPoll = initialOrderStatus === "pending" && ["pending", "processing"].includes(initialPaymentStatus ?? "");

  useEffect(() => {
    if (!shouldPoll) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/orders/${publicId}/status`, { cache: "no-store" });
        if (!response.ok || !active) return;
        const data = await response.json() as { orderStatus: OrderStatus; paymentStatus: PaymentStatus | null };
        const next = `${data.orderStatus}:${data.paymentStatus ?? "none"}`;
        if (next !== snapshot) { setSnapshot(next); router.refresh(); }
      } catch { /* The next poll retries transient local/network failures. */ }
    };
    void poll();
    const interval = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [publicId, router, shouldPoll, snapshot]);

  if (!shouldPoll) return null;
  return <p className="mt-3 text-center text-xs text-neutral-600" role="status">Confirmando el estado con Mercado Pago…</p>;
}
