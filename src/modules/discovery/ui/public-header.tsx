import Link from "next/link";
import { LogIn, Plus } from "lucide-react";

export function PublicHeader() {
  return <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#090909]/90 backdrop-blur-xl"><div className="container-shell flex h-16 items-center justify-between gap-2"><Link href="/" className="shrink-0 text-sm font-black tracking-[-.03em] sm:text-base">NIGHTLIFE OS</Link><nav aria-label="Navegación principal" className="flex items-center gap-0.5 text-sm sm:gap-1"><Link className="rounded-full px-2.5 py-2 text-neutral-400 transition hover:bg-white/[.05] hover:text-white sm:px-3" href="/eventos"><span className="sm:hidden">Entradas</span><span className="hidden sm:inline">Comprar entradas</span></Link><Link aria-label="Ingresar como productor" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2.5 py-2 text-neutral-400 transition hover:bg-white/[.05] hover:text-white sm:px-3" href="/login"><LogIn aria-hidden size={16}/><span className="hidden md:inline">Ingresar</span></Link><Link className="btn btn-primary min-h-10 px-3 py-2 sm:ml-1 sm:px-3.5" href="/crear-evento/iniciar"><Plus aria-hidden size={16}/><span className="hidden sm:inline">Crear evento</span><span className="sm:hidden">Crear</span></Link></nav></div></header>;
}

export function PublicFooter() {
  return <footer className="container-shell flex flex-col gap-3 border-t border-white/[.07] py-8 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between"><span className="font-black text-neutral-400">NIGHTLIFE OS</span><div className="flex gap-5"><Link href="/eventos" className="hover:text-white">Eventos</Link><Link href="/crear-evento" className="hover:text-white">Publicar una fecha</Link><Link href="/login" className="hover:text-white">Ingresar</Link></div></footer>;
}
