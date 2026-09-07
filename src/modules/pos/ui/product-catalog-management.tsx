"use client";

import { useActionState, useState } from "react";
import { Archive, ChevronDown, PackagePlus, Plus, Tags } from "lucide-react";
import { createProduct, createProductCategory, setProductActive } from "../application/actions";
import { formatMoney } from "@/shared/lib/format";
import { ActionMessage } from "@/shared/ui/action-message";
import { SubmitButton } from "@/shared/ui/submit-button";

type Category = { id: string; name: string; active: boolean };
type Product = { id: string; name: string; description: string; category_id: string | null; sku: string | null; barcode: string | null; default_price_amount: number | null; currency: string; active: boolean };

export function ProductCatalogManagement({ categories, products }: { categories: Category[]; products: Product[] }) {
  const [productOpen, setProductOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  return <>
    <div className="mt-7 flex flex-wrap gap-2"><button className="btn btn-primary" onClick={() => setProductOpen(true)}><PackagePlus size={17}/>Nuevo producto</button><button className="btn btn-secondary" onClick={() => setCategoryOpen(true)}><Tags size={17}/>Nueva categoría</button></div>
    {products.length ? <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => {
      const category = categories.find((item) => item.id === product.category_id);
      return <article className={`card p-5 ${product.active ? "" : "opacity-55"}`} key={product.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-neutral-600">{category?.name ?? "Sin categoría"}</p><h2 className="mt-2 text-xl font-black">{product.name}</h2></div><span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-black uppercase">{product.active ? "Activo" : "Inactivo"}</span></div><p className="mt-4 text-2xl font-black">{product.default_price_amount === null ? "Sin precio habitual" : formatMoney(product.default_price_amount, product.currency)}</p>{product.sku && <p className="mt-2 text-xs text-neutral-500">SKU {product.sku}</p>}<form action={setProductActive} className="mt-5"><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="active" value={String(!product.active)}/><button className="btn btn-ghost min-h-10 px-3 text-xs"><Archive size={15}/>{product.active ? "Desactivar" : "Reactivar"}</button></form></article>;
    })}</section> : <section className="card mt-7 p-10 text-center"><PackagePlus className="mx-auto text-neutral-600"/><h2 className="mt-4 text-xl font-black">Tu catálogo está vacío</h2><p className="mt-2 text-sm text-neutral-500">Creá cada producto una vez y reutilizalo en todas tus fechas.</p></section>}
    {productOpen && <ProductDialog categories={categories.filter((category) => category.active)} onClose={() => setProductOpen(false)}/>}
    {categoryOpen && <CategoryDialog onClose={() => setCategoryOpen(false)}/>}
  </>;
}

function ProductDialog({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [state, action] = useActionState(createProduct, {});
  return <Dialog title="Nuevo producto" onClose={onClose}><form action={action} className="grid gap-4"><label className="label">Nombre<input className="field" name="name" placeholder="Fernet" required autoFocus/></label><label className="label">Categoría<select className="field" name="categoryId" defaultValue=""><option value="">Sin categoría</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="label">Precio habitual en ARS <span className="font-normal text-neutral-600">(opcional)</span><input className="field" name="pricePesos" type="number" min="0" step="1" inputMode="numeric" placeholder="8000"/></label><details className="rounded-xl border border-[var(--border)] p-4"><summary className="flex cursor-pointer items-center justify-between text-sm font-bold">Opciones avanzadas <ChevronDown size={16}/></summary><div className="mt-4 grid gap-4"><label className="label">SKU<input className="field" name="sku"/></label><label className="label">Código de barras<input className="field" name="barcode"/></label><label className="label">Descripción<textarea className="field min-h-20" name="description"/></label></div></details><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-primary min-h-14"><Plus size={17}/>Crear producto</SubmitButton></form></Dialog>;
}

function CategoryDialog({ onClose }: { onClose: () => void }) {
  const [state, action] = useActionState(createProductCategory, {});
  return <Dialog title="Nueva categoría" onClose={onClose}><form action={action} className="grid gap-4"><label className="label">Nombre<input className="field" name="name" placeholder="Tragos" required autoFocus/></label><ActionMessage message={state.error}/><ActionMessage message={state.success} tone="success"/><SubmitButton className="btn btn-primary min-h-14">Crear categoría</SubmitButton></form></Dialog>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="w-full rounded-t-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7" role="dialog" aria-modal="true"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black">{title}</h2><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">×</button></div>{children}</section></div>;
}
