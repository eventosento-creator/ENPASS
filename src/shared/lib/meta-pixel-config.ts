// Compartido entre el servidor (que anota conversiones) y el cliente (que las envía al Pixel).
export const META_PENDING_COOKIE = "enpass_px";
export type MetaConversion = "registro" | "evento_publicado";

// ID del Pixel de Meta de ENPASS (es público: viaja en el HTML). La variable permite cambiarlo sin tocar código.
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1131412102657420";
