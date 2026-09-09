import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { BUYER_SESSION_COOKIE, getBuyerSessionCustomerIds } from "@/modules/ticketing/application/buyer-access";
import { logoutBuyer } from "@/modules/ticketing/application/actions";
import { getTicketPresentationsForCustomers } from "@/modules/ticketing/application/queries";
import { EventTicketList } from "@/modules/ticketing/ui/event-ticket-list";
import { EnpassLogo } from "@/shared/ui/brand";

export default async function EventTicketsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rawSession = (await cookies()).get(BUYER_SESSION_COOKIE)?.value;
  const customerIds = await getBuyerSessionCustomerIds(rawSession);
  if (customerIds.length === 0) notFound();

  const allTickets = await getTicketPresentationsForCustomers(customerIds);
  const tickets = allTickets.filter((ticket) => ticket.eventSlug === slug);
  if (!tickets.length) notFound();

  return <main className="container-shell min-h-screen py-6 sm:py-10">
    <header className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-4"><Link href="/"><EnpassLogo/></Link><form action={logoutBuyer}><button className="btn btn-ghost min-h-10 px-3 text-xs" type="submit"><LogOut size={15}/> Salir</button></form></header>
    <section className="mx-auto max-w-2xl">
      <Link href="/mis-entradas" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-white"><ArrowLeft size={16}/>Todos mis eventos</Link>
      <div className="mb-6 mt-4"><p className="eyebrow">{tickets.length === 1 ? "1 credencial" : `${tickets.length} credenciales`}</p><h1 className="mt-2 text-4xl font-black tracking-[-.05em]">{tickets[0]!.eventName}</h1></div>
      <EventTicketList tickets={tickets}/>
    </section>
  </main>;
}
