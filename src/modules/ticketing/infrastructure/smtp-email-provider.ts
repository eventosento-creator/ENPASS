import "server-only";

import nodemailer from "nodemailer";
import type { ArrepentimientoReceivedEmail, ArrepentimientoVerificationEmail, BuyerAccessEmail, CollaboratorInviteEmail, EmailProvider, EventChangeEmail, EventReminderEmail, PromoterInviteEmail, TicketEmail } from "./email-provider";

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
    const countLabel = message.tickets.length === 1 ? "1 entrada" : `${message.tickets.length} entradas`;
    const cids = message.tickets.map((_, index) => `qr-${index}-${Date.now()}`);
    const attachments = message.tickets.map((ticket, index) => ({
      filename: `qr-${index + 1}.png`,
      content: ticket.qrPng,
      cid: cids[index],
      contentType: "image/png",
    }));
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Tus entradas para ${message.eventName}`,
      text: `¡Tu entrada está lista!\n\n${message.eventName}\n${message.eventDateLabel} · ${message.eventTimeLabel}\n${message.venueName}\n${countLabel}\n\nVer mis accesos: ${message.accessUrl}`,
      attachments,
      html: emailFrame(`
        <h1 style="margin:0 0 8px;font-size:28px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b">¡Tu entrada está lista!</h1>
        <p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#6f6f75">Gracias por ser parte. Te dejamos ${countLabel} y toda la información del evento.</p>
        ${message.tickets.map((ticket, index) => ticketCard(message.eventName, message.eventDateLabel, message.eventTimeLabel, message.venueName, message.venueAddress, ticket, cids[index]!)).join('<div style="height:16px;line-height:16px">&nbsp;</div>')}
        <div style="margin-top:22px;border-radius:14px;background:#f4f4f1;padding:16px 18px;display:flex">
          <table role="presentation" style="border-collapse:collapse"><tr>
            <td valign="top" style="padding-right:12px;font-size:18px">ℹ️</td>
            <td valign="top">
              <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#0a0a0b">Importante</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6f6f75">Mostrá este código desde tu celular en la entrada. Cada código es único e intransferible.</p>
            </td>
          </tr></table>
        </div>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#9a9a9f">¿Perdiste este mail? Entrá a <a href="${escapeHtml(message.accessUrl)}" style="color:#0a0a0b;font-weight:700">Mis accesos</a> con este link personal.</p>
      `),
    });
  }

  async sendBuyerAccess(message: BuyerAccessEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: "Tu acceso está listo",
      text: `Tu acceso está listo. Hacé clic para ingresar a tus entradas y mesas: ${message.accessUrl}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">Tu acceso está listo</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">Hacé clic en el botón de abajo para ingresar a tu cuenta y ver tus entradas, mesas y próximos eventos.</p>
        ${accessButton(message.accessUrl, "Ingresar a ENPASS")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Este enlace es personal, seguro y expira en 15 minutos.</p>
        ${noticeBox("¿No solicitaste este acceso?", "Podés ignorar este mensaje. Si tenés dudas, escribinos a enpass.gf@gmail.com")}
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
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">Te sumaron a ${escapeHtml(message.eventName)}</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">Hola ${escapeHtml(message.promoterName)}. Ya tenés tu link personal para compartir entradas y revisar tus ventas.</p>
        ${accessButton(message.accessUrl, "Ver mis ventas")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Este enlace es personal, seguro y expira en 24 horas.</p>
      `),
    });
  }

  async sendCollaboratorInvite(message: CollaboratorInviteEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Te invitaron a ${message.eventName}`,
      text: `${message.inviterName} te invitó a colaborar en ${message.eventName}. Aceptá la invitación: ${message.acceptUrl}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">Te invitaron a colaborar</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">${escapeHtml(message.inviterName)} te sumó al equipo de <strong>${escapeHtml(message.eventName)}</strong> en ENPASS.</p>
        ${accessButton(message.acceptUrl, "Aceptar invitación")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Este enlace es personal y expira en 7 días.</p>
      `),
    });
  }

  async sendEventReminder(message: EventReminderEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Falta poco para ${message.eventName}`,
      text: `¡Falta poco!\n\n${message.eventName}\n${message.eventDateLabel} · ${message.eventTimeLabel}\n${message.venueName}\n\nVer mi entrada: ${message.accessUrl}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">¡Falta poco!</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">Tu evento es mañana. Te dejamos los datos para que no se te pase nada.</p>
        <div style="margin-top:24px;border-radius:18px;overflow:hidden;border:1px solid #e6e6e1">
          <div style="background:#0a0a0b;color:#ffffff;padding:20px 22px 18px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#b0b0b6">${escapeHtml(message.eventDateLabel)} · ${escapeHtml(message.eventTimeLabel)}</p>
            <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.15">${escapeHtml(message.eventName)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#b0b0b6">${escapeHtml(message.venueName)}${message.venueAddress ? `, ${escapeHtml(message.venueAddress)}` : ""}</p>
          </div>
        </div>
        ${accessButton(message.accessUrl, "Ver mi entrada")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Este enlace es personal, seguro y expira pronto.</p>
      `),
    });
  }

  async sendEventChangeNotice(message: EventChangeEmail) {
    const changesText = message.changedFields.join(" y ");
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: `Cambios en ${message.eventName}`,
      text: `Actualizamos ${changesText} de ${message.eventName}.\n\n${message.eventName}\n${message.eventDateLabel} · ${message.eventTimeLabel}\n${message.venueName}\n\nVer mi entrada: ${message.accessUrl}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">Hay novedades en tu evento</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">El organizador actualizó ${escapeHtml(changesText)} de <strong>${escapeHtml(message.eventName)}</strong>. Estos son los datos vigentes:</p>
        <div style="margin-top:24px;border-radius:18px;overflow:hidden;border:1px solid #e6e6e1">
          <div style="background:#0a0a0b;color:#ffffff;padding:20px 22px 18px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#b0b0b6">${escapeHtml(message.eventDateLabel)} · ${escapeHtml(message.eventTimeLabel)}</p>
            <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.15">${escapeHtml(message.eventName)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#b0b0b6">${escapeHtml(message.venueName)}${message.venueAddress ? `, ${escapeHtml(message.venueAddress)}` : ""}</p>
          </div>
        </div>
        ${accessButton(message.accessUrl, "Ver mi entrada")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Tu entrada sigue siendo válida, no hace falta que hagas nada.</p>
      `),
    });
  }
  async sendArrepentimientoVerification(message: ArrepentimientoVerificationEmail) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: "Confirmá tu solicitud de arrepentimiento",
      text: `Recibimos tu solicitud de arrepentimiento. Confirmala desde este enlace: ${message.confirmUrl}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:28px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">Confirmá tu solicitud</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">Recibimos un pedido de arrepentimiento para una compra asociada a este email. Para continuar, confirmalo desde el botón de abajo.</p>
        ${accessButton(message.confirmUrl, "Confirmar solicitud")}
        <p style="margin:18px 0 0;font-size:12px;color:#9a9a9f;text-align:center">Este enlace es personal, seguro y expira en 30 minutos.</p>
        ${noticeBox("¿No pediste esto?", "Podés ignorar este mensaje con tranquilidad, no se va a procesar ningún cambio sin tu confirmación.")}
      `),
    });
  }

  async sendArrepentimientoReceived(message: ArrepentimientoReceivedEmail) {
    const subject = message.eligible ? "Tu solicitud de arrepentimiento fue registrada" : "Tu solicitud de arrepentimiento no es elegible";
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject,
      text: `Código de gestión: ${message.managementCode}\n\n${message.eligible ? "Tu solicitud cumple las condiciones del derecho de arrepentimiento. Te vamos a contactar con los próximos pasos." : `Tu solicitud no cumple las condiciones: ${message.reason ?? "revisá la Política de Reembolsos."}`}`,
      html: emailFrame(`
        ${heroBanner()}
        <h1 style="margin:0 0 10px;font-size:28px;line-height:1.15;letter-spacing:-.03em;color:#0a0a0b;text-align:center">${message.eligible ? "Solicitud registrada" : "Solicitud no elegible"}</h1>
        <p style="margin:0 auto;max-width:380px;font-size:14px;line-height:1.6;color:#6f6f75;text-align:center">${message.eligible ? "Tu pedido cumple con las condiciones del derecho de arrepentimiento. Guardá el código de gestión de tu solicitud." : escapeHtml(message.reason ?? "Tu pedido no cumple con las condiciones del derecho de arrepentimiento.")}</p>
        <div style="margin-top:22px;border-radius:14px;background:#f4f4f1;padding:16px 18px;text-align:center">
          <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9a9a9f">Código de gestión</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:900;letter-spacing:.04em;color:#0a0a0b">${escapeHtml(message.managementCode)}</p>
        </div>
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
  const logoUrl = siteUrl("/brand/enpass-wordmark-black.png");
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f0ec;color:#0a0a0b;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px">
      <div style="border-radius:24px;background:#ffffff;overflow:hidden;box-shadow:0 1px 2px rgba(10,10,11,.04)">
        <div style="padding:30px 32px 8px">
          <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
            <td valign="middle"><img src="${logoUrl}" alt="ENPASS" height="24" style="display:block;height:24px;width:auto"></td>
            <td valign="middle" align="right" style="font-size:10px;font-weight:800;letter-spacing:.1em;line-height:1.7;color:#9a9a9f">EVENTOS<br>PERSONAS<br>MOMENTOS<br>—</td>
          </tr></table>
        </div>
        <div style="padding:20px 32px 36px">${content}</div>
        <div style="padding:22px 32px;border-top:1px solid #ececE6">
          <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
            <td valign="middle">
              <img src="${logoUrl}" alt="ENPASS" height="16" style="display:block;height:16px;width:auto">
              <p style="margin:8px 0 0;font-size:11px;color:#9a9a9f">Claridad. Dirección. Momentos.</p>
            </td>
            <td valign="middle" align="right">
              <a href="https://www.instagram.com/enpass.arg/" style="text-decoration:none;font-size:14px;margin-left:6px">📷</a>
              <a href="https://www.facebook.com/profile.php?id=61594279708620" style="text-decoration:none;font-size:14px;margin-left:6px">👍</a>
              <a href="mailto:enpass.gf@gmail.com" style="text-decoration:none;font-size:11px;color:#6f6f75;margin-left:10px">enpass.gf@gmail.com</a>
            </td>
          </tr></table>
        </div>
      </div>
    </div>
  </body></html>`;
}

function heroBanner() {
  return `<div style="border-radius:16px;background:linear-gradient(155deg,#17171a 0%,#0a0a0b 75%);padding:26px 24px;margin-bottom:26px">
    <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
      <td valign="top" style="font-size:10px;font-weight:800;letter-spacing:.1em;line-height:1.7;color:#c8c8cd">MÁS<br>QUE EVENTOS<br>EXPERIENCIAS<br>—</td>
      <td valign="bottom" align="right" style="font-size:10px;font-weight:800;letter-spacing:.08em;line-height:1.6;color:#c8c8cd">ENPASS<br>2024 — ∞</td>
    </tr></table>
  </div>`;
}

function ticketCard(eventName: string, dateLabel: string, timeLabel: string, venueName: string, venueAddress: string, ticket: { holderName: string; document: string | null; ticketTypeName: string; shortCode: string }, qrCid: string) {
  return `<div style="border-radius:18px;overflow:hidden;border:1px solid #e6e6e1">
    <div style="background:#0a0a0b;color:#ffffff;padding:20px 22px 18px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#b0b0b6">${escapeHtml(dateLabel)} · ${escapeHtml(timeLabel)}</p>
      <p style="margin:0;font-size:22px;font-weight:900;letter-spacing:-.02em;line-height:1.15">${escapeHtml(eventName)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#b0b0b6">${escapeHtml(venueName)}${venueAddress ? `, ${escapeHtml(venueAddress)}` : ""}</p>
    </div>
    <div style="background:#ffffff;padding:20px 22px">
      <table role="presentation" width="100%" style="border-collapse:collapse"><tr>
        <td valign="top" style="padding-right:8px;width:33%"><p style="margin:0;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9a9a9f">Tipo de entrada</p><p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#0a0a0b">${escapeHtml(ticket.ticketTypeName)}</p></td>
        <td valign="top" style="padding:0 8px;width:34%"><p style="margin:0;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9a9a9f">Nombre</p><p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#0a0a0b">${escapeHtml(ticket.holderName)}</p></td>
        ${ticket.document ? `<td valign="top" style="padding-left:8px;width:33%"><p style="margin:0;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#9a9a9f">DNI</p><p style="margin:4px 0 0;font-size:14px;font-weight:800;color:#0a0a0b">${escapeHtml(ticket.document)}</p></td>` : ""}
      </tr></table>
      <div style="margin-top:20px;text-align:center">
        <img src="cid:${qrCid}" alt="Código QR" width="180" height="180" style="display:inline-block;width:180px;height:180px">
        <p style="margin:10px 0 0;font-size:13px;font-weight:900;letter-spacing:.08em;color:#0a0a0b">${escapeHtml(ticket.shortCode)}</p>
      </div>
    </div>
  </div>`;
}

function noticeBox(title: string, description: string) {
  return `<div style="margin-top:26px;border-radius:14px;background:#f4f4f1;padding:16px 18px">
    <table role="presentation" style="border-collapse:collapse"><tr>
      <td valign="top" style="padding-right:12px;font-size:18px">🔒</td>
      <td valign="top">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#0a0a0b">${escapeHtml(title)}</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#6f6f75">${escapeHtml(description)}</p>
      </td>
    </tr></table>
  </div>`;
}

function accessButton(accessUrl: string, label = "Ver mis accesos") {
  return `<p style="margin:26px 0 0;text-align:center"><a href="${escapeHtml(accessUrl)}" style="display:inline-block;min-width:220px;border-radius:14px;background:#0a0a0b;color:#ffffff;padding:16px 26px;text-align:center;text-decoration:none;font-weight:900;font-size:14px">${escapeHtml(label)} →</a></p>`;
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
