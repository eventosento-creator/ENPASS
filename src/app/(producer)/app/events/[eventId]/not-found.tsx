import Link from "next/link";
export default function NotFound() { return <section className="card p-8 text-center"><h1 className="text-2xl font-black">Evento no encontrado</h1><p className="mt-2 text-neutral-500">No existe o no tenés acceso.</p><Link className="btn btn-primary mt-6" href="/app/events">Volver a eventos</Link></section>; }
