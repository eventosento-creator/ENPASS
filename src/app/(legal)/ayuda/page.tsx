import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Centro de ayuda · ENPASS",
  description: "Preguntas frecuentes sobre cómo comprar entradas, medios de pago, reembolsos y cómo usar tu entrada en ENPASS.",
};

const FAQ_GROUPS: { title: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    title: "Comprar entradas",
    items: [
      { q: "¿Cómo compro una entrada?", a: "Entrá al evento desde enpass.com.ar/eventos, elegí el tipo de entrada o mesa, completá tus datos y pagá con Mercado Pago. La entrada te llega por mail y queda disponible en Mis entradas." },
      { q: "¿Qué medios de pago aceptan?", a: "Todos los que ofrece Mercado Pago en el momento del pago: tarjetas de crédito y débito, dinero en cuenta y, según el evento, efectivo o transferencia." },
      { q: "¿Puedo comprar sin crear una cuenta?", a: "Sí, solo necesitás tu email para recibir la entrada. Si querés ver todas tus compras en un solo lugar, podés crear una cuenta con ese mismo email." },
      { q: "Compré y no me llegó el mail con la entrada", a: <>Revisá spam/promociones. Si no aparece, buscá tu compra en <Link className="underline" href={"/mis-entradas" as never}>Mis entradas</Link> con el mismo email que usaste al comprar.</> },
    ],
  },
  {
    title: "Tu entrada",
    items: [
      { q: "¿Cómo uso mi entrada el día del evento?", a: "Mostrá el código QR de tu entrada (desde el mail o desde Mis entradas) en el acceso. No hace falta imprimirla." },
      { q: "¿Puedo transferir mi entrada a otra persona?", a: "Depende del evento. Si el organizador lo habilita, vas a poder hacerlo desde Mis entradas; si no ves esa opción, contactá directamente al organizador del evento." },
      { q: "Perdí el mail, ¿cómo recupero mi entrada?", a: <>Entrá a <Link className="underline" href={"/mis-entradas" as never}>Mis entradas</Link> con el mismo email de la compra.</> },
    ],
  },
  {
    title: "Pagos y reembolsos",
    items: [
      { q: "Me cobraron y la compra figura como pendiente o fallida", a: "Puede pasar mientras Mercado Pago confirma el pago. Esperá unos minutos y revisá Mis entradas; si sigue sin acreditarse, escribinos por mail con el email usado en la compra." },
      { q: "¿Puedo pedir un reembolso?", a: <>Las condiciones de reembolso las define cada evento. Consultá la <Link className="underline" href={"/reembolsos" as never}>política de reembolsos</Link> o el <Link className="underline" href={"/arrepentimiento" as never}>botón de arrepentimiento</Link>.</> },
      { q: "Cancelaron o pospusieron el evento que compré", a: "El organizador es responsable de avisar y gestionar el reembolso o reprogramación de las entradas ya vendidas. Si no recibiste novedades, escribinos y te ayudamos a contactarlo." },
    ],
  },
  {
    title: "Para organizadores",
    items: [
      { q: "¿Cómo empiezo a vender entradas para mi evento?", a: <>Creá tu cuenta en <Link className="underline" href="/crear-evento">enpass.com.ar/crear-evento</Link>, cargá tu evento y conectá tu cuenta de Mercado Pago para poder cobrar.</> },
      { q: "¿Cuándo recibo el dinero de mis ventas?", a: "El dinero se acredita directo en tu cuenta de Mercado Pago según el cronograma de liberación de esa cuenta (lo ves en Configuración → Pagos dentro de tu panel)." },
    ],
  },
];

export default function AyudaPage() {
  return <main className="container-shell min-h-screen py-10 sm:py-16">
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Ayuda</p>
      <h1 className="page-title mt-2">Centro de ayuda</h1>
      <p className="mt-3 text-sm leading-6 text-neutral-500">Respuestas rápidas a las dudas más comunes. Si no encontrás lo que buscás, escribinos.</p>

      {FAQ_GROUPS.map((group) => <section key={group.title} className="card mt-8 overflow-hidden">
        <h2 className="border-b border-white/[.07] p-5 text-sm font-black uppercase tracking-[.08em] text-neutral-500 sm:px-7">{group.title}</h2>
        <div className="divide-y divide-white/[.07]">
          {group.items.map((item) => <details key={item.q} className="group p-5 sm:px-7">
            <summary className="cursor-pointer list-none text-sm font-bold marker:content-none">
              <span className="flex items-center justify-between gap-4">
                {item.q}
                <span aria-hidden className="shrink-0 text-neutral-500 transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <div className="mt-3 text-sm leading-6 text-neutral-500">{item.a}</div>
          </details>)}
        </div>
      </section>)}

      <section className="card mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="font-bold">¿No encontraste tu respuesta?</h2>
          <p className="mt-1 text-sm text-neutral-500">Escribinos y te respondemos a la brevedad.</p>
        </div>
        <a className="btn btn-primary w-full sm:w-auto" href="mailto:enpass.gf@gmail.com"><Mail size={16}/>Escribirnos</a>
      </section>
    </div>
  </main>;
}
