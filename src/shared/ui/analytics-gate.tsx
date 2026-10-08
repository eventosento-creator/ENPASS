"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Google Analytics mide la web pública (eventos, compras, clubes). Las pantallas de trabajo del equipo
// (panel del productor, scanner, caja, portal de RRPP, invitaciones) no se miden: ensucian visitas y conversiones.
const EXCLUDED_PREFIXES = ["/app", "/scan", "/club-scan", "/pos", "/promoter", "/invite", "/dev", "/actualizar-clave"];

export function isAnalyticsExcluded(pathname: string) {
  return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Se usa el interruptor oficial de gtag (window["ga-disable-<ID>"]): corta todo envío mientras la persona está en esas pantallas
// y se reactiva al volver a la web pública, también al navegar sin recargar la página.
export function AnalyticsGate({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = isAnalyticsExcluded(pathname);
  }, [gaId, pathname]);
  return null;
}
