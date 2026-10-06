import { sendGAEvent } from "@next/third-parties/google";

// Google Analytics 4. Solo corre en el navegador y solo si la etiqueta cargó (producción con NEXT_PUBLIC_GA_ID);
// en desarrollo o sin ID estas funciones no hacen nada. Los importes de la base están en centavos: acá van en pesos.
export type AnalyticsItem = { item_id: string; item_name: string; item_variant?: string; item_category?: string; item_category2?: string; item_brand?: string; price: number; quantity: number };

type GtagWindow = Window & { dataLayer?: unknown[] };

function trackEvent(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined" || !(window as GtagWindow).dataLayer) return;
  try { sendGAEvent("event", name, params); } catch { /* la analítica nunca debe romper la página */ }
}

export const toPesos = (minorUnits: number) => minorUnits / 100;

export function trackViewItem(item: AnalyticsItem, currency = "ARS") {
  trackEvent("view_item", { currency, value: item.price, items: [item] });
}

export function trackAddToCart(item: AnalyticsItem, currency = "ARS") {
  trackEvent("add_to_cart", { currency, value: item.price * item.quantity, items: [item] });
}

export function trackBeginCheckout(items: AnalyticsItem[], value: number, currency = "ARS") {
  trackEvent("begin_checkout", { currency, value, items });
}

export function trackPurchase(transactionId: string, items: AnalyticsItem[], value: number, currency = "ARS") {
  trackEvent("purchase", { transaction_id: transactionId, currency, value, items });
}
