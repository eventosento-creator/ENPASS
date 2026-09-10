import type { LegalDocument } from "@/shared/database/types";

const TYPE_LABEL: Record<LegalDocument["type"], string> = {
  terms_buyer: "Términos y Condiciones",
  refund_policy: "Política de Reembolsos",
  privacy_policy: "Política de Privacidad",
  organizer_agreement: "Acuerdo para Organizadores",
};

export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return <main className="container-shell min-h-screen py-10 sm:py-16">
    <article className="mx-auto max-w-2xl card p-6 sm:p-10">
      <p className="eyebrow">{TYPE_LABEL[document.type]} · v{document.version}</p>
      <p className="mt-2 text-xs text-neutral-500">Vigente desde el {new Date(document.effective_from).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}</p>
      <div className="prose-legal mt-8">{renderLegalMarkdown(document.content)}</div>
    </article>
  </main>;
}

function renderLegalMarkdown(content: string) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] | null = null;
  let listOrdered = false;
  let key = 0;

  const flushList = () => {
    if (!listItems) return;
    const items = listItems;
    const ordered = listOrdered;
    key += 1;
    blocks.push(ordered
      ? <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-neutral-400" key={`list-${key}`}>{items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</ol>
      : <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-neutral-400" key={`list-${key}`}>{items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</ul>);
    listItems = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushList(); continue; }
    if (line === "---") { flushList(); key += 1; blocks.push(<hr className="my-6 border-white/[.08]" key={`hr-${key}`}/>); continue; }
    if (line.startsWith("### ")) { flushList(); key += 1; blocks.push(<h3 className="mt-5 text-sm font-black text-white" key={`h3-${key}`}>{renderInline(line.slice(4))}</h3>); continue; }
    if (line.startsWith("## ")) { flushList(); key += 1; blocks.push(<h2 className="mt-8 text-lg font-black tracking-[-.01em] text-white" key={`h2-${key}`}>{renderInline(line.slice(3))}</h2>); continue; }
    if (line.startsWith("# ")) { flushList(); continue; }
    const bulletMatch = /^-\s+(.*)$/.exec(line);
    if (bulletMatch) {
      if (!listItems || listOrdered) { flushList(); listItems = []; listOrdered = false; }
      listItems.push(bulletMatch[1]!);
      continue;
    }
    const numberedMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (numberedMatch) {
      if (!listItems || !listOrdered) { flushList(); listItems = []; listOrdered = true; }
      listItems.push(numberedMatch[1]!);
      continue;
    }
    flushList();
    key += 1;
    blocks.push(<p className="mt-3 text-sm leading-6 text-neutral-400" key={`p-${key}`}>{renderInline(line)}</p>);
  }
  flushList();
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong className="font-bold text-white" key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  });
}
