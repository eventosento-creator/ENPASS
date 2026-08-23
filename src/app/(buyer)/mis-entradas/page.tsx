import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound, LogOut, Ticket } from "lucide-react";
import { BuyerAccessForm } from "@/modules/ticketing/ui/buyer-access-form";
import { TicketCarousel } from "@/modules/ticketing/ui/ticket-carousel";
import { BUYER_SESSION_COOKIE, getBuyerSessionCustomerIds } from "@/modules/ticketing/application/buyer-access";
import { logoutBuyer } from "@/modules/ticketing/application/actions";
import { getTicketPresentationsForCustomers } from "@/modules/ticketing/application/queries";

export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const query = await searchParams;
  const rawSession = (await cookies()).get(BUYER_SESSION_COOKIE)?.value;
  const customerIds = await getBuyerSessionCustomerIds(rawSession);
  const tickets = await getTicketPresentationsForCustomers(customerIds);

  if (customerIds.length === 0) return <main className="container-shell grid min-h-screen place-items-center py-8 sm:py-12"><section className="w-full max-w-md">
    <header className="mb-8 flex items-center justify-between"><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link><span className="flex items-center gap-1.5 text-xs text-neutral-600"><KeyRound size={14}/> Acceso sin contraseña</span></header>
    <div className="card p-6 sm:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-[var(--accent)] text-black"><Ticket size={23}/></div><p className="eyebrow mt-7">Mis entradas</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em]">Encontrá tus entradas.</h1><p className="mt-4 text-sm leading-6 text-neutral-500">Ingresá el email que usaste para comprar. Te enviaremos un acceso seguro, sin contraseña.</p>{query.access === "invalid" && <p className="mt-5 rounded-xl border border-amber-300/10 bg-amber-300/[.04] p-4 text-sm text-amber-100/75" role="alert">Ese acceso venció o ya fue utilizado. Pedí uno nuevo.</p>}<BuyerAccessForm/></div>
  </section></main>;

  return <main className="container-shell min-h-screen py-6 sm:py-10"><header className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-4"><Link href="/" className="text-sm font-black tracking-[-.03em]">NIGHTLIFE OS</Link><form action={logoutBuyer}><button className="btn btn-ghost min-h-10 px-3 text-xs" type="submit"><LogOut size={15}/> Salir</button></form></header><section className="mx-auto max-w-2xl"><div className="mb-6"><p className="eyebrow">Acceso personal</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Mis entradas</h1><p className="mt-2 text-sm text-neutral-500">{tickets.length === 1 ? "1 entrada disponible" : `${tickets.length} entradas disponibles`}</p></div>{tickets.length > 0 ? <TicketCarousel tickets={tickets}/> : <div className="card p-8 text-center"><Ticket className="mx-auto text-neutral-600" size={32}/><h2 className="mt-4 text-xl font-black">Todavía no hay entradas emitidas</h2><p className="mt-2 text-sm text-neutral-500">Si tu pago ya fue confirmado, volvé a intentar en unos instantes.</p></div>}</section></main>;
}
