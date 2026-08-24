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
        <p style="margin:0 0 10px;color:#d6ff45;font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase">Compra confirmada</p>
        <h1 style="margin:0 0 24px;font-size:34px;line-height:1.02;letter-spacing:-.04em">¡Ya tenés tus entradas!</h1>
        <div style="border-top:1px solid #29292d;border-bottom:1px solid #29292d;padding:20px 0">
          <p style="margin:0 0 8px;font-size:21px;font-weight:800">${escapeHtml(message.eventName)}</p>
          <p style="margin:0;color:#a3a3a9;line-height:1.65">${escapeHtml(message.eventDate)}<br>${escapeHtml(message.venueName)}</p>
          <p style="margin:14px 0 0;color:#f7f7f5;font-weight:800">${countLabel}</p>
        </div>
        ${accessButton(message.accessUrl)}
        <p style="margin:24px 0 0;color:#77777f;font-size:12px;line-height:1.6">El enlace es personal y vence en 15 minutos. Después podés pedir uno nuevo desde Mis entradas.</p>
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
  return `<!doctype html><html lang="es"><body style="margin:0;background:#090909;color:#f7f7f5;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><p style="margin:0 0 18px;font-size:14px;font-weight:900;letter-spacing:-.02em">NIGHTLIFE OS</p><div style="border:1px solid #29292d;border-radius:22px;background:#141416;padding:32px">${content}</div><p style="margin:18px 0 0;text-align:center;color:#55555c;font-size:11px">Acceso seguro · No necesitás una cuenta</p></div></body></html>`;
}

function accessButton(accessUrl: string) {
  return `<p style="margin:28px 0 0"><a href="${escapeHtml(accessUrl)}" style="display:block;border-radius:13px;background:#d6ff45;color:#090909;padding:15px 20px;text-align:center;text-decoration:none;font-weight:900">Ver mis entradas</a></p>`;
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
