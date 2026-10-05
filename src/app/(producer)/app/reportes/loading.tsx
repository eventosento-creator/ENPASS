// Skeletons del dashboard: se muestran mientras se recalcula el reporte (al entrar y al cambiar filtros).
const block = "animate-pulse rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)]";

export default function ReportsLoading() {
  return <div className="grid gap-5" aria-busy="true" aria-label="Cargando reportes">
    <div><div className="h-9 w-40 animate-pulse rounded-lg bg-[var(--surface-strong)]"/><div className="mt-3 h-4 w-72 animate-pulse rounded bg-[var(--surface-strong)]"/><div className="mt-8 flex gap-2.5"><div className="h-10 w-48 animate-pulse rounded-xl bg-[var(--surface-strong)]"/><div className="h-10 w-56 animate-pulse rounded-xl bg-[var(--surface-strong)]"/><div className="h-10 w-28 animate-pulse rounded-xl bg-[var(--surface-strong)]"/></div></div>
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className={`${block} h-28 w-[15rem] shrink-0 sm:w-auto`}/>)}</div>
    <div className="grid gap-5 lg:grid-cols-3"><div className={`${block} h-80 lg:col-span-2`}/><div className={`${block} h-80`}/></div>
    <div className={`${block} h-72`}/>
    <div className="grid gap-5 lg:grid-cols-2"><div className={`${block} h-64`}/><div className={`${block} h-64`}/></div>
  </div>;
}
