"use client";

import { useActionState } from "react";
import { importMembersCsv, type ImportMembersState } from "../application/actions";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function MembersImport() {
  const [state, action] = useActionState<ImportMembersState, FormData>(importMembersCsv, {});
  return <details className="card mt-6 p-4">
    <summary className="cursor-pointer text-sm font-bold">Importar / exportar socios (CSV)</summary>
    <div className="mt-4 grid gap-4">
      <p className="text-sm text-neutral-500">Columnas: <span className="font-mono text-xs">Nº Socio, Nombre, Apellido, DNI, Mail, Celular, Categoria, Division</span>. Si dejás el Nº Socio vacío se completa solo. Las categorías y divisiones tienen que existir antes. Podés poner varias divisiones separadas por &quot;;&quot;. No se manda ningún mail a los socios importados.</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-secondary" href="/app/socios/export" download>Exportar socios</a>
        <a className="btn btn-ghost" href="/app/socios/export?plantilla=1" download>Descargar plantilla</a>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="label">Archivo CSV<input className="field" type="file" name="file" accept=".csv,text/csv" required/></label>
        <SubmitButton className="btn btn-primary" pendingLabel="Importando…">Importar</SubmitButton>
      </form>
      <ActionMessage message={state.error}/>
      {state.created !== undefined && <ActionMessage tone="success" message={`${state.created} socios importados${state.skipped ? `, ${state.skipped} con problemas` : ""}.`}/>}
      {state.problems && state.problems.length > 0 && <ul className="max-h-64 overflow-auto rounded-xl border border-white/[.08] p-3 text-xs text-amber-500">
        {state.problems.map((problem, index) => <li key={index}>Fila {problem.line}: {problem.message}</li>)}
      </ul>}
    </div>
  </details>;
}
