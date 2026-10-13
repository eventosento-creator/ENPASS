import { resolveClubBrand } from "./brand";

export type MemberCardStatusKind = "ok" | "overdue" | "blocked" | "suspended";

/** Estado que se ve en el carnet. Misma regla que la puerta: suspendido, o con deuda en un club que bloquea el ingreso, no pasa. */
export function memberCardStatus(input: { memberStatus: string; overdueCount: number; debtBlocksEntry: boolean }) {
  const suspended = input.memberStatus === "suspended";
  const debt = input.overdueCount > 0;
  if (suspended) return { kind: "suspended" as const, label: "Suspendido", detail: "Hablá con el club para regularizar tu membresía.", blocked: true };
  if (debt && input.debtBlocksEntry) return { kind: "blocked" as const, label: "Con deuda", detail: "Regularizá tus cuotas para ingresar.", blocked: true };
  if (debt) return { kind: "overdue" as const, label: "Cuota vencida", detail: "Tenés cuotas vencidas. Podés ingresar, pero conviene ponerte al día.", blocked: false };
  return { kind: "ok" as const, label: "Al día", detail: null, blocked: false };
}

/** Segundos que le quedan al QR dinámico (NLOSM1:<id>.<vence>.<firma>); 0 si venció o no se puede leer. */
export function qrSecondsLeft(payload: string | null | undefined, nowMs = Date.now()) {
  const expires = Number(payload?.match(/\.(\d{10})\./)?.[1]);
  return Number.isFinite(expires) ? Math.max(0, expires - Math.floor(nowMs / 1000)) : 0;
}

/** Colores del carnet a partir del color del club (si no tiene, un negro neutro). */
export function memberCardTheme(accentColor: string | null | undefined) {
  const brand = resolveClubBrand(accentColor);
  return brand
    ? { accent: brand.accent, onAccent: brand.onAccent, background: brand.gradient }
    : { accent: "#0a0a0b", onAccent: "#ffffff", background: "linear-gradient(135deg, #17171a 0%, #050506 100%)" };
}

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1]![0]! : "")).toUpperCase() || "C";
}

/** Manifiesto de la app instalable: un ícono propio por club que abre directo el carnet. */
export function buildCarnetManifest(club: { slug: string; name: string; accentColor: string | null }) {
  const theme = memberCardTheme(club.accentColor);
  return {
    id: `/mi-club/${club.slug}/carnet`,
    name: `Carnet ${club.name}`,
    short_name: club.name.length > 12 ? club.name.slice(0, 12).trim() : club.name,
    description: `Tu carnet de socio de ${club.name}.`,
    lang: "es-AR",
    start_url: `/mi-club/${club.slug}/carnet?origen=app`,
    scope: `/mi-club/${club.slug}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: theme.accent,
    theme_color: theme.accent,
    icons: [
      { src: `/mi-club/${club.slug}/carnet/icon/192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/mi-club/${club.slug}/carnet/icon/512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/mi-club/${club.slug}/carnet/icon/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
