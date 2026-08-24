"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordField({
  label,
  name,
  autoComplete,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return <label className="label">{label}<span className="relative block">
    <input className="field pr-12" name={name} type={visible ? "text" : "password"} minLength={8} autoComplete={autoComplete} required />
    <button
      type="button"
      className="absolute inset-y-0 right-0 grid w-12 place-items-center text-neutral-500 transition hover:text-white"
      aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
      aria-pressed={visible}
      onClick={() => setVisible((current) => !current)}
    >{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
  </span></label>;
}
