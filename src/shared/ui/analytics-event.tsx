"use client";

import { useEffect } from "react";
import { trackBeginCheckout, trackPurchase, trackViewItem, type AnalyticsItem } from "@/shared/lib/analytics";

type Props =
  | { kind: "view_item"; item: AnalyticsItem; currency: string }
  | { kind: "begin_checkout"; items: AnalyticsItem[]; value: number; currency: string }
  | { kind: "purchase"; transactionId: string; items: AnalyticsItem[]; value: number; currency: string };

/** Dispara un evento de GA4 una vez al mostrarse. La compra se recuerda en el navegador para no repetirse al recargar. */
export function AnalyticsEvent(props: Props) {
  const key = JSON.stringify(props);
  useEffect(() => {
    const event = JSON.parse(key) as Props;
    if (event.kind === "view_item") trackViewItem(event.item, event.currency);
    else if (event.kind === "begin_checkout") trackBeginCheckout(event.items, event.value, event.currency);
    else {
      const stored = `ga_purchase_${event.transactionId}`;
      try { if (localStorage.getItem(stored)) return; localStorage.setItem(stored, "1"); } catch { /* sin storage: GA igual deduplica por transaction_id */ }
      trackPurchase(event.transactionId, event.items, event.value, event.currency);
    }
  }, [key]);
  return null;
}
