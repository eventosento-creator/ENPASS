import "server-only";

import nodemailer from "nodemailer";
import type { BuyerAccessEmail, EmailProvider, PromoterInviteEmail, TicketEmail } from "./email-provider";

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  private readonly from: string;

  constructor(config = smtpConfig()) {
    this.from = config.from;
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  async sendTicketDelivery(message: TicketEmail) {
    const countLabel = message.ticketCount === 1 ? "1 acceso" : `${message.ticketCount} accesos`;
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Tus accesos para ${message.eventName}`,
      text: `¡Tu compra está confirmada!\n\n${message.eventName}\n${message.eventDate}\n${message.venueName}\n${countLabel}\n\nVer mis accesos: ${message.accessUrl}`,
      html: emailFrame(`
        <h1 style="margin:0 0 8px;font-size:28px;line-height:1.1;letter-spacing:-.03em;color:#0a0a0b">¡Tu entrada está lista!</h1>
        <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#6f6f75">Gracias por ser parte. Te dejamos el resumen de tu compra y todo lo que necesitás para el evento.</p>
        ${ticketCard(message.eventName, message.eventDate, message.venueName, countLabel)}
        ${accessButton(message.accessUrl)}
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9a9a9f">El enlace es personal y vence en 15 minutos. Después podés pedir uno nuevo desde Mis accesos.</p>
      `),
    });
  }

  async sendBuyerAccess(message: BuyerAccessEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: "Acceso a tus compras",
      text: `Abrí este acceso seguro para ver tus entradas y mesas: ${message.accessUrl}`,
      html: emailFrame(`
        <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9a9a9f">Acceso sin contraseña</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;letter-spacing:-.03em;color:#0a0a0b">Tus accesos, a un toque.</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6f75">Usá este acceso personal para abrir tus entradas y mesas. Vence en 15 minutos y solo puede utilizarse una vez.</p>
        ${accessButton(message.accessUrl)}
      `),
    });
  }

  async sendPromoterInvite(message: PromoterInviteEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Te sumaron a ${message.eventName}`,
      text: `Hola ${message.promoterName}. Ya tenés tu link para vender entradas de ${message.eventName}. Ver mis ventas: ${message.accessUrl}`,
      html: emailFrame(`
        <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9a9a9f">Acceso RRPP</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;letter-spacing:-.03em;color:#0a0a0b">Te sumaron a ${escapeHtml(message.eventName)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6f6f75">Hola ${escapeHtml(message.promoterName)}. Ya tenés tu link personal para compartir entradas y revisar tus ventas.</p>
        ${accessButton(message.accessUrl, "Ver mis ventas")}
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9a9a9f">Este acceso vence en 24 horas y solo puede utilizarse una vez.</p>
      `),
    });
  }
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const from = process.env.SMTP_FROM;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !Number.isInteger(port) || port < 1 || !from) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  if (Boolean(user) !== Boolean(password)) throw new Error("SMTP_AUTH_INCOMPLETE");
  return { host, port, from, secure: process.env.SMTP_SECURE === "true", auth: user && password ? { user, pass: password } : undefined };
}

function siteUrl(path: string) {
  try { return new URL(path).toString(); }
  catch { return new URL(path, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString(); }
}

function emailFrame(content: string) {
  const logoUrl = siteUrl("/brand/enpass-wordmark-white.png");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f1;color:#0a0a0b;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto">
      <div style="background:#0a0a0b;padding:22px 28px">
        <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
          <td valign="middle"><img src="${logoUrl}" alt="ENPASS" height="22" style="display:block;height:22px;width:auto"></td>
          <td valign="middle" align="right" style="font-size:12px;line-height:1.4;color:#b0b0b6">Tu próxima<br>experiencia te espera.</td>
        </tr></table>
      </div>
      <div style="background:#ffffff;padding:32px 28px">${content}</div>
      <div style="padding:20px 28px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;font-weight:900;letter-spacing:-.01em;color:#0a0a0b">ENPASS</p>
        <p style="margin:0;font-size:11px;color:#9a9a9f">Claridad. Dirección. Momentos.</p>
      </div>
    </div>
  </body></html>`;
}

function ticketCard(eventName: string, eventDate: string, venueName: string, countLabel: string) {
  return `<div style="border-radius:18px;overflow:hidden;border:1px solid #e6e6e1">
    <div style="background:#0a0a0b;color:#ffffff;padding:22px 22px 20px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#b0b0b6">${escapeHtml(eventDate)}</p>
      <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.15">${escapeHtml(eventName)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#b0b0b6">${escapeHtml(venueName)}</p>
    </div>
    <div style="background:#ffffff;padding:18px 22px">
      <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9f">Incluye</p>
      <p style="margin:4px 0 0;font-size:16px;font-weight:800;color:#0a0a0b">${escapeHtml(countLabel)}</p>
    </div>
  </div>`;
}

function accessButton(accessUrl: string, label = "Ver mis accesos") {
  return `<p style="margin:28px 0 0"><a href="${escapeHtml(accessUrl)}" style="display:block;border-radius:13px;background:#0a0a0b;color:#ffffff;padding:15px 20px;text-align:center;text-decoration:none;font-weight:900;font-size:14px">${escapeHtml(label)}</a></p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
