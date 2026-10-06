/** Color de acento del club listo para usar en la página pública: validado y con el texto que contrasta. */
export function resolveClubBrand(accentColor: string | null | undefined) {
  const accent = accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor.toLowerCase() : null;
  if (!accent) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const onAccent = luminance > 0.4 ? "#0a0a0b" : "#ffffff";
  return { accent, onAccent, gradient: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 60%, #000) 100%)` };
}
