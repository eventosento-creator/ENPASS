"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { refreshMemberQr } from "../application/member-portal-actions";

const REFRESH_MS = 45_000;

/** QR personal del socio: se renueva solo cada 45 s (el código vence a los 90 s). */
export function MemberQrCard({ slug, initialPayload, blocked }: { slug: string; initialPayload: string; blocked: boolean }) {
  const [payload, setPayload] = useState(initialPayload);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, { margin: 1, width: 480, errorCorrectionLevel: "M" }).then((url) => { if (!cancelled) setImage(url); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [payload]);

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshMemberQr(slug).then((next) => { if (next) setPayload(next); }); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshMemberQr(slug).then((next) => { if (next) setPayload(next); }); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [slug]);

  return <div className="mx-auto w-full max-w-xs rounded-[1.35rem] bg-white p-4 text-[#090909]">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img src={image} alt="Tu código QR de socio" className={`aspect-square w-full ${blocked ? "opacity-40" : ""}`}/> : <div className="aspect-square w-full animate-pulse rounded-xl bg-neutral-200"/>}
    <p className="mt-2 text-center text-[11px] font-semibold text-neutral-500">{blocked ? "Regularizá tu situación para ingresar" : "Mostrá este código en la puerta · se renueva solo"}</p>
  </div>;
}
