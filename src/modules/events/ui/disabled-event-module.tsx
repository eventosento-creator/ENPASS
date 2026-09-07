import Link from "next/link";
import { CircleOff } from "lucide-react";

export function DisabledEventModule({ eventId, eventName, moduleName }: { eventId: string; eventName: string; moduleName: string }) {
  return <section className="mx-auto max-w-xl py-16 text-center">
    <CircleOff className="mx-auto text-neutral-700" size={38}/>
    <p className="eyebrow mt-6">{eventName}</p>
    <h1 className="mt-3 text-3xl font-black">{moduleName} no está activa</h1>
    <p className="mt-3 text-sm leading-6 text-neutral-500">La información histórica se conserva. Activá la función desde la configuración si querés volver a operarla.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3"><Link className="btn btn-primary" href={`/app/events/${eventId}/edit#funciones`}>Configurar funciones</Link><Link className="btn btn-secondary" href={`/app/events/${eventId}`}>Volver al resumen</Link></div>
  </section>;
}
