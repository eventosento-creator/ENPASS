import Image from "next/image";
import { cn } from "@/shared/lib/cn";

type EventCoverProps = {
  src: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

export function EventCover({ src, alt, className, priority = false, sizes = "(max-width: 768px) 100vw, 50vw" }: EventCoverProps) {
  return <div className={cn("event-cover relative overflow-hidden bg-[#171719]", className)}>
    {src ? <Image src={src} alt={alt} fill sizes={sizes} priority={priority} loading={priority ? "eager" : undefined} className="object-cover transition duration-500 group-hover:scale-[1.02]"/> : <Fallback/>}
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/5"/>
  </div>;
}

function Fallback() {
  return <div className="absolute inset-0 overflow-hidden bg-[#111114]">
    <div className="absolute left-[-20%] top-[12%] h-[55%] w-[80%] rounded-full bg-violet-700/25 blur-3xl"/>
    <div className="absolute bottom-[-15%] right-[-15%] h-[65%] w-[80%] rounded-full bg-blue-600/20 blur-3xl"/>
    <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:32px_32px]"/>
    <span className="absolute bottom-5 left-5 text-xs font-black tracking-[.2em] text-white/50">NIGHTLIFE OS</span>
  </div>;
}
