"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("enpass-theme", next);
  }
  return <button type="button" onClick={toggleTheme} aria-label="Cambiar modo claro u oscuro" title="Cambiar tema" className={`btn btn-ghost btn-icon min-h-10 ${className}`}>
    <span className="theme-icon-light"><Moon size={16}/></span><span className="theme-icon-dark"><Sun size={16}/></span>
  </button>;
}
