import { cn } from "@/shared/lib/cn";

export function EnpassMark({ className }: { className?: string }) {
  return <svg aria-hidden viewBox="0 0 64 48" className={cn("h-8 w-auto", className)} fill="none">
    <path fill="currentColor" d="M4 4h44v9H14v7h23v-6l19 10-19 10v-6H14v7h34v9H4V4Z"/>
  </svg>;
}

export function EnpassLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn("inline-flex items-center text-[var(--text)]", className)} aria-label="ENPASS">
    <EnpassMark className={compact ? "h-7" : "h-8"}/>
    {!compact && <span aria-hidden className="brand-wordmark -ml-0.5">NPASS</span>}
  </span>;
}
