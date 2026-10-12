"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAnalyticsExcluded } from "@/shared/ui/analytics-gate";
import { META_PENDING_COOKIE, type MetaConversion } from "@/shared/lib/meta-pixel-config";

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; push?: unknown; loaded?: boolean; version?: string };
type MetaWindow = Window & { fbq?: Fbq; _fbq?: Fbq };

// Envía un evento al Pixel de Meta si está cargado (en desarrollo o sin ID no hace nada).
export function trackMeta(event: string, params?: Record<string, unknown>) {
  (window as MetaWindow).fbq?.("track", event, params);
}

// Mismo cargador que el snippet oficial de Meta: deja una cola mientras baja fbevents.js.
// Se apaga la configuración automática (rastreo de clics y formularios por su cuenta): solo mandamos nuestros eventos.
function loadPixel(pixelId: string) {
  const w = window as MetaWindow;
  if (w.fbq) return;
  const fbq = ((...args: unknown[]) => { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue!.push(args); }) as Fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
  w.fbq = fbq; w._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
}

const CONVERSIONS: Record<MetaConversion, (fbq: Fbq) => void> = {
  registro: (fbq) => fbq("track", "CompleteRegistration"),
  evento_publicado: (fbq) => fbq("trackCustom", "EventoPublicado"),
};

// Pixel de Meta para medir la pauta. Igual que Google Analytics, las visitas se miden solo en la web pública;
// las conversiones anotadas por el servidor (cuenta creada, evento publicado) se envían en cualquier pantalla.
export function MetaPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    loadPixel(pixelId);
    const fbq = (window as MetaWindow).fbq!;
    if (!isAnalyticsExcluded(pathname)) fbq("track", "PageView");
    const pending = document.cookie.split("; ").find((row) => row.startsWith(`${META_PENDING_COOKIE}=`))?.split("=")[1];
    if (!pending) return;
    document.cookie = `${META_PENDING_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    for (const conversion of decodeURIComponent(pending).split(",")) CONVERSIONS[conversion as MetaConversion]?.(fbq);
  }, [pathname, pixelId]);
  return null;
}
