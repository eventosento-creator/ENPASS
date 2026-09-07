import Image from "next/image";
import { cn } from "@/shared/lib/cn";

const MARK_RATIO = 698 / 445;
const WORDMARK_RATIO = 1081 / 213;

export function EnpassMark({ className }: { className?: string }) {
  return <span className={cn("relative inline-block h-8 w-auto", className)} style={{ aspectRatio: MARK_RATIO }} aria-hidden>
    <Image src="/brand/enpass-mark-black.png" alt="" fill sizes="64px" className="theme-icon-light object-contain"/>
    <Image src="/brand/enpass-mark-white.png" alt="" fill sizes="64px" className="theme-icon-dark object-contain"/>
  </span>;
}

export function EnpassLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  if (compact) return <span className={cn("inline-flex items-center", className)} aria-label="ENPASS"><EnpassMark/></span>;
  return <span className={cn("relative inline-block h-8 w-auto", className)} style={{ aspectRatio: WORDMARK_RATIO }} aria-label="ENPASS">
    <Image src="/brand/enpass-wordmark-black.png" alt="" fill priority sizes="200px" className="theme-icon-light object-contain object-left"/>
    <Image src="/brand/enpass-wordmark-white.png" alt="" fill priority sizes="200px" className="theme-icon-dark object-contain object-left"/>
  </span>;
}

export function EnpassLockup({ label, className }: { label: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-2.5", className)}>
    <EnpassLogo/>
    <span className="border-l border-[var(--border-strong)] pl-2.5 text-[10px] font-black uppercase tracking-[.14em] text-[var(--muted)]">{label}</span>
  </span>;
}
