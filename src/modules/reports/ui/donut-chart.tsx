export type DonutSegment = { key: string; label: string; value: number; color: string };

/** Donut en SVG (sin librerías): cada segmento es un arco del círculo; el centro muestra el total. */
export function DonutChart({ segments, center, caption, size = 150, thickness = 3.4 }: { segments: DonutSegment[]; center: string; caption: string; size?: number; thickness?: number }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 25; // arranca arriba
  return <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${caption}: ${segments.map((segment) => `${segment.label} ${total ? Math.round((segment.value / total) * 100) : 0}%`).join(", ")}`}>
    <svg viewBox="0 0 36 36" className="size-full -rotate-0">
      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-strong)" strokeWidth={thickness}/>
      {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => {
        const pct = (segment.value / total) * 100;
        const circle = <circle key={segment.key} cx="18" cy="18" r="15.9155" fill="none" stroke={segment.color} strokeWidth={thickness} strokeDasharray={`${Math.max(pct - 0.6, 0.1)} ${100 - Math.max(pct - 0.6, 0.1)}`} strokeDashoffset={offset} strokeLinecap="round"/>;
        offset -= pct;
        return circle;
      })}
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-lg font-black tracking-[-.02em] sm:text-xl">{center}</span><span className="text-[11px] font-semibold text-[var(--muted)]">{caption}</span></div>
  </div>;
}

export function DonutLegend({ segments, formatValue }: { segments: DonutSegment[]; formatValue?: (segment: DonutSegment) => string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <ul className="grid min-w-0 flex-1 gap-2.5 text-sm">
    {segments.map((segment) => <li key={segment.key} className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2"><span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: segment.color }}/><span className="truncate text-[var(--text-secondary)]">{segment.label}</span></span>
      <span className="shrink-0 font-bold tabular-nums">{formatValue ? formatValue(segment) : `${total ? Math.round((segment.value / total) * 100) : 0}%`}</span>
    </li>)}
  </ul>;
}
