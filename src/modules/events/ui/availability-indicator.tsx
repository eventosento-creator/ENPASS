export function AvailabilityIndicator({ reserved, capacity, compact = false, label = "reservas" }: { reserved: number; capacity: number; compact?: boolean; label?: string }) {
  const percentage = capacity > 0 ? Math.min(100, Math.round((reserved / capacity) * 100)) : 0;
  return <div>
    <div className="flex items-baseline justify-between gap-3"><p className={compact ? "text-xs text-neutral-500" : "text-sm text-neutral-400"}><strong className="text-[var(--text)]">{reserved}</strong> / {capacity} {label}</p><span className="text-[11px] text-neutral-600">{percentage}%</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-500/15"><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${percentage}%` }}/></div>
  </div>;
}
