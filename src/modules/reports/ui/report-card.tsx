import type { ReactNode } from "react";

export function ReportCard({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-xs)] ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[15px] font-black tracking-[-.01em]">{title}</h2>{action}</div>
    <div className="mt-4">{children}</div>
  </section>;
}

export function CardEmpty({ text }: { text: string }) {
  return <p className="rounded-xl bg-[var(--background-soft)] px-4 py-8 text-center text-sm text-[var(--muted)]">{text}</p>;
}
