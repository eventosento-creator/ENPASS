import type { Route } from "next";

export function safeProducerPath(value: FormDataEntryValue | string | null | undefined, fallback: Route = "/app"): Route {
  if (typeof value !== "string") return fallback;
  const isAppRoute = value === "/app" || value.startsWith("/app/") || value.startsWith("/app?") || value.startsWith("/invite/aceptar?token=") || value.startsWith("/invite/club?token=");
  if (!isAppRoute || value.includes("\\")) return fallback;
  return value as Route;
}

export function safeAuthPath(value: string | null | undefined, fallback: Route = "/app"): Route {
  if (value === "/actualizar-clave") return value;
  return safeProducerPath(value, fallback);
}
