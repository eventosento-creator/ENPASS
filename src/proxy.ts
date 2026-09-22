import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith("/app") && !data?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const eventSlugMatch = request.nextUrl.pathname.match(/^\/e\/([^/]+)$/);
  if (eventSlugMatch) {
    const { data: eventRows, error } = await supabase.rpc("get_public_event_by_slug", { target_slug: eventSlugMatch[1] });
    // Only show a hard 404 when the lookup cleanly succeeded with zero rows. A transient
    // network/DB error here must NOT be treated as "not found" — that would turn a blip
    // into a false 404 for a real, published event. On error, fall through and let the
    // page's own (more resilient) lookup decide.
    if (!error && !eventRows?.[0]) return notFoundResponse();
  }

  return response;
}

function notFoundResponse() {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>Evento no encontrado · ENPASS</title></head><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:2rem"><div><h1 style="font-size:1.5rem">Este evento no existe o ya no está disponible.</h1><p style="margin-top:.75rem"><a href="/eventos" style="color:#fff">Ver todos los eventos</a></p></div></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|brand/|demo/|robots.txt|sitemap.xml).*)"],
};
