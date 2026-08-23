import "server-only";

import nodemailer from "nodemailer";
import type { BuyerAccessEmail, EmailProvider, TicketEmail } from "./email-provider";

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  private readonly from: string;

  constructor(config = smtpConfig()) {
    this.from = config.from;
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
    });
  }

  async sendTicketDelivery(message: TicketEmail) {
    const countLabel = message.ticketCount === 1 ? "1 entrada" : `${message.ticketCount} entradas`;
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Tus entradas para ${message.eventName}`,
      text: `¡Ya tenés tus entradas!\n\n${message.eventName}\n${message.eventDate}\n${message.venueName}\n${countLabel}\n\nVer mis entradas: ${message.accessUrl}`,
      html: emailFrame(`
        <p style="margin:0 0 8px;color:#a3a3a3;font-size:13px;letter-spacing:.12em;text-transform:uppercase">Compra confirmada</p>
        <h1 style="margin:0 0 18px;font-size:32px;line-height:1.05">¡Ya tenés tus entradas!</h1>
        <p style="margin:0 0 6px;font-size:20px;font-weight:700">${escapeHtml(message.eventName)}</p>
        <p style="margin:0;color:#a3a3a3;line-height:1.6">${escapeHtml(message.eventDate)}<br>${escapeHtml(message.venueName)}<br>${countLabel}</p>
        ${accessButton(message.accessUrl)}
        <p style="margin:24px 0 0;color:#777;font-size:12px;line-height:1.6">Este acceso es personal y vence en 15 minutos. Después podés pedir uno nuevo desde Mis entradas.</p>
      `),
    });
  }

  async sendBuyerAccess(message: BuyerAccessEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: "Acceso a tus entradas",
      text: `Abrí este acceso seguro para ver tus entradas: ${message.accessUrl}`,
      html: emailFrame(`
        <p style="margin:0 0 8px;color:#a3a3a3;font-size:13px;letter-spacing:.12em;text-transform:uppercase">Nightlife OS</p>
        <h1 style="margin:0 0 18px;font-size:32px;line-height:1.05">Tus entradas, a un toque.</h1>
        <p style="margin:0;color:#a3a3a3;line-height:1.6">Usá este acceso personal para abrir Mis entradas. Vence en 15 minutos y solo puede utilizarse una vez.</p>
        ${accessButton(message.accessUrl)}
      `),
    });
  }
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const from = process.env.SMTP_FROM;
  if (!host || !Number.isInteger(port) || port < 1 || !from) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  return { host, port, from, secure: process.env.SMTP_SECURE === "true" };
}

function emailFrame(content: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#090909;color:#f7f7f5;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><div style="border:1px solid #2a2a2a;border-radius:20px;background:#141416;padding:32px">${content}</div></div></body></html>`;
}

function accessButton(accessUrl: string) {
  return `<p style="margin:28px 0 0"><a href="${escapeHtml(accessUrl)}" style="display:inline-block;border-radius:12px;background:#d6ff45;color:#090909;padding:14px 20px;text-decoration:none;font-weight:800">Ver mis entradas</a></p>`;
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
