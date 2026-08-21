export function AvailabilityIndicator({ reserved, capacity, compact = false }: { reserved: number; capacity: number; compact?: boolean }) {
  const percentage = capacity > 0 ? Math.min(100, Math.round((reserved / capacity) * 100)) : 0;
  return <div>
    <div className="flex items-baseline justify-between gap-3"><p className={compact ? "text-xs text-white/65" : "text-sm text-white/70"}><strong className="text-white">{reserved}</strong> / {capacity} reservas</p><span className="text-[11px] text-white/40">{percentage}%</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${percentage}%` }}/></div>
  </div>;
}
