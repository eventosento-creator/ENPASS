"use client";

import { useActionState, useState } from "react";
import { updateOrganizationSlug } from "../application/actions";
import type { ActionState } from "@/modules/identity/application/actions";
import { slugify } from "@/shared/lib/format";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

export function ChangeClubLinkForm({ organizationId, slug }: { organizationId: string; slug: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateOrganizationSlug, {});
  const [value, setValue] = useState(slug);
  const preview = slugify(value);
  return <form action={action} className="grid gap-3 sm:max-w-xl" onSubmit={(event) => { if (preview !== slug && !confirm("Al cambiar el link, el anterior deja de funcionar (también en los mails ya enviados). ¿Cambiarlo?")) event.preventDefault(); }}>
    <input type="hidden" name="organizationId" value={organizationId}/>
    <label className="label">Link del club
      <span className="flex items-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)]"><span className="shrink-0 bg-[var(--surface-raised)] px-3 py-3 text-sm text-neutral-500">enpass.com.ar/clubes/</span><input className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none" name="slug" value={value} onChange={(event) => setValue(event.target.value)} minLength={3} maxLength={60} required autoCapitalize="none" autoCorrect="off" spellCheck={false}/></span>
    </label>
    <p className="text-xs text-neutral-500">Quedará: <span className="font-mono text-neutral-400">enpass.com.ar/clubes/{preview || "…"}</span>. Solo letras, números y guiones. El link anterior deja de funcionar.</p>
    <ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/>
    <SubmitButton className="btn btn-primary w-fit" pendingLabel="Guardando…">Guardar link</SubmitButton>
  </form>;
}
