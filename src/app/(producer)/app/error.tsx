"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="card p-6"><h2 className="text-xl font-bold">No pudimos cargar esta pantalla</h2><p className="mt-2 text-neutral-400">Revisá tu conexión e intentá nuevamente.</p><button onClick={reset} className="btn btn-primary mt-5">Reintentar</button></section>; }
