import Link from "next/link";
import { Plus } from "lucide-react";

export function PublicHeader() {
  return <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#090909]/90 backdrop-blur-xl"><div className="container-shell flex h-16 items-center justify-between gap-4"><Link href="/" className="text-sm font-black tracking-[-.03em] sm:text-base">NIGHTLIFE OS</Link><nav aria-label="Navegación principal" className="flex items-center gap-1 text-sm"><Link className="rounded-full px-3 py-2 text-neutral-400 transition hover:bg-white/[.05] hover:text-white" href="/eventos">Eventos</Link><Link className="hidden rounded-full px-3 py-2 text-neutral-400 transition hover:bg-white/[.05] hover:text-white sm:inline-flex" href="/crear-evento">Para productores</Link><Link className="btn btn-primary ml-1 min-h-10 px-3.5 py-2" href="/crear-evento/iniciar"><Plus aria-hidden size={16}/><span className="hidden sm:inline">Crear evento</span><span className="sm:hidden">Crear</span></Link></nav></div></header>;
}

export function PublicFooter() {
  return <footer className="container-shell flex flex-col gap-3 border-t border-white/[.07] py-8 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between"><span className="font-black text-neutral-400">NIGHTLIFE OS</span><div className="flex gap-5"><Link href="/eventos" className="hover:text-white">Eventos</Link><Link href="/crear-evento" className="hover:text-white">Publicar una fecha</Link><Link href="/login" className="hover:text-white">Ingresar</Link></div></footer>;
}
