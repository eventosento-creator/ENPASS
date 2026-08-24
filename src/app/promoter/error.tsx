"use client";

export default function PromoterError({ reset }: { reset: () => void }) {
  return <main className="container-shell grid min-h-screen place-items-center py-10"><section className="text-center"><h1 className="text-2xl font-black">No pudimos cargar tus ventas</h1><p className="mt-2 text-sm text-neutral-500">Tu información sigue segura. Probá nuevamente.</p><button className="btn btn-primary mt-5" type="button" onClick={reset}>Reintentar</button></section></main>;
}
