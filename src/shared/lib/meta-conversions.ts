import "server-only";
import { cookies } from "next/headers";
import { META_PENDING_COOKIE, META_PIXEL_ID, type MetaConversion } from "./meta-pixel-config";

// Conversiones del Pixel de Meta que ocurren dentro de una Server Action (la acción termina en redirect, así que no hay
// código de cliente que pueda dispararlas). Se dejan anotadas en una cookie corta y el componente MetaPixel las envía
// al cargar la página siguiente, y la borra.
export async function queueMetaConversion(conversion: MetaConversion) {
  if (process.env.NODE_ENV !== "production" || !META_PIXEL_ID) return;
  const store = await cookies();
  const pending = new Set((store.get(META_PENDING_COOKIE)?.value ?? "").split(",").filter(Boolean));
  pending.add(conversion);
  store.set(META_PENDING_COOKIE, [...pending].join(","), { path: "/", maxAge: 600, sameSite: "lax", secure: true, httpOnly: false });
}
