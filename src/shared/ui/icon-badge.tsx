import type { LucideIcon } from "lucide-react";

const tones = {
  emerald: { bg: "var(--dot-emerald-bg)", fg: "var(--dot-emerald)" },
  amber: { bg: "var(--dot-amber-bg)", fg: "var(--dot-amber)" },
  red: { bg: "rgb(255 102 115 / 14%)", fg: "var(--danger)" },
  blue: { bg: "var(--dot-sky-bg)", fg: "var(--dot-sky)" },
  violet: { bg: "var(--dot-violet-bg)", fg: "var(--dot-violet)" },
  neutral: { bg: "var(--dot-neutral-bg)", fg: "var(--dot-neutral)" },
} as const;

export type IconBadgeTone = keyof typeof tones;

const sizes = {
  8: { box: "size-8", icon: 15 },
  9: { box: "size-9", icon: 16 },
  10: { box: "size-10", icon: 17 },
  11: { box: "size-11", icon: 19 },
} as const;

export function IconBadge({ icon: Icon, tone = "neutral", size = 10 }: { icon: LucideIcon; tone?: IconBadgeTone; size?: keyof typeof sizes }) {
  const { bg, fg } = tones[tone];
  const { box, icon } = sizes[size];
  return <span className={`grid ${box} shrink-0 place-items-center rounded-full`} style={{ backgroundColor: bg, color: fg }}><Icon size={icon}/></span>;
}
