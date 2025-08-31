// backend/src/mailer.js
import nodemailer from 'nodemailer';

function boolFromEnv(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(s);
}

export function buildTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = boolFromEnv(process.env.SMTP_SECURE, port === 465);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return transporter;
}

/**
 * Envía un ticket por correo (HTML + adjuntos).
 * Asegura destinatario usando buyer_email || SENDER_EMAIL || SMTP_USER.
 */
export async function sendTicketEmail({
  to,
  subject,
  html,
  attachments = [],
}) {
  const buyerTo = (to || '').trim();
  const fallbackSender = (process.env.SENDER_EMAIL || '').trim();
  const fallbackSmtpUser = (process.env.SMTP_USER || '').trim();

  const finalTo = buyerTo || fallbackSender || fallbackSmtpUser;

  console.log('[mailer] to(buyer)=', buyerTo || '(vacío)',
              ' fallback(SENDER_EMAIL)=', fallbackSender || '(vacío)',
              ' fallback(SMTP_USER)=', fallbackSmtpUser || '(vacío)');

  if (!finalTo) {
    // Lanzamos error claro ANTES de que nodemailer devuelva EENVELOPE
    throw new Error('[mailer] No hay destinatario (buyer_email/SENDER_EMAIL/SMTP_USER están vacíos)');
  }

  const fromAddr = (process.env.SENDER_EMAIL || process.env.SMTP_USER || '').trim();
  const replyTo = (process.env.REPLY_TO || fromAddr || '').trim();

  const transporter = buildTransport();

  const mail = {
    from: fromAddr || undefined,
    to: finalTo,
    replyTo: replyTo || undefined,
    subject: subject || 'Tus boletos',
    html: html || '',
    attachments: attachments || [],
  };

  return transporter.sendMail(mail);
}
