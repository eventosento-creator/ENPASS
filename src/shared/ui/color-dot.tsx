const cycle = ["var(--dot-amber)", "var(--dot-emerald)", "var(--dot-sky)", "var(--dot-violet)", "var(--dot-rose)", "var(--dot-neutral)"];

export function ColorDot({ index = 0 }: { index?: number }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: cycle[index % cycle.length] }}/>;
}
