import { NextResponse } from "next/server";

// Service worker del carnet: deja la última versión del carnet disponible sin señal. Solo cachea la pantalla del carnet y los
// archivos estáticos de la app; nada de la API. Al cerrar sesión el carnet manda "clear" y se borra lo guardado.
function script(slug: string) {
  return `
const CACHE = "enpass-carnet-${slug}-v1";
const CARNET = "/mi-club/${slug}/carnet";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => { if (event.data === "clear") event.waitUntil(caches.delete(CACHE)); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === CARNET) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // Solo se guarda un carnet real (sin redirecciones al login).
        if (response.ok && !response.redirected) { const cache = await caches.open(CACHE); await cache.put(CARNET, response.clone()); }
        return response;
      } catch {
        const cached = await caches.match(CARNET, { cacheName: CACHE });
        return cached || new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;padding:2rem;text-align:center'><h1>Sin conexión</h1><p>Abrí tu carnet una vez con señal para tenerlo disponible sin conexión.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
});
`;
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new NextResponse("No encontrado", { status: 404 });
  return new NextResponse(script(slug), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": `/mi-club/${slug}/` },
  });
}
