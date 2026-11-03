"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn btn-primary", pendingLabel = "Guardando…", disabled = false }: { children: React.ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending || disabled} type="submit">{pending ? pendingLabel : children}</button>;
}
