import type { NextRequest } from "next/server";

export function localRequestUrl(request: NextRequest, pathname: string) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  target.hash = "";
  if (process.env.NODE_ENV === "development") {
    const host = request.headers.get("host");
    if (host && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) target.host = host;
  }
  return target;
}
