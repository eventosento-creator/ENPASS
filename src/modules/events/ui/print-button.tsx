"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn btn-primary print:hidden"><Printer size={16}/>{label}</button>;
}
