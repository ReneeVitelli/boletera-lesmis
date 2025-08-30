import nodemailer from 'nodemailer';
import fs from 'node:fs';

/**
 * Crea el transporter SMTP con variables de entorno.
 * Requiere:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Opcionales:
 *   SENDER_EMAIL, SENDER_NAME
 */
function makeTransport() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('[mailer] Faltan SMTP_USER / SMTP_PASS en variables de entorno');
  }

  const secure = port === 465; // 465 = TLS
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/**
 * Envía el correo con el PDF del boleto adjunto.
 * Export nombrado: sendTicketEmail
 */
export async function sendTicketEmail({
  to,
  name = '',
  subject = 'Tus boletos',
  ticketId,
  function_label,
  event_title = 'Evento',
  currency = 'MXN',
  price = 0,
  verifyUrl,
  pdfPath,
}) {
  const transporter = makeTransport();

  const fromEmail = process.env.SENDER_EMAIL || process.env.SMTP_USER;
  const fromName = process.env.SENDER_NAME || 'Boletera';

  // Cuerpo sencillo en texto y HTML
  const text = [
    `Hola ${name || ''},`,
    '',
    `Adjuntamos tu boleto para: ${event_title}`,
    `Función: ${function_label}`,
    `Boleto: ${ticketId}`,
    `Precio: ${price} ${currency}`,
    '',
    `Puedes validar tu boleto aquí: ${verifyUrl}`,
    '',
    '¡Gracias por tu compra!',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <p>Hola ${name || ''},</p>
      <p>Adjuntamos tu boleto para: <strong>${event_title}</strong></p>
      <ul>
        <li><strong>Función:</strong> ${function_label}</li>
        <li><strong>Boleto:</strong> ${ticketId}</li>
        <li><strong>Precio:</strong> ${price} ${currency}</li>
      </ul>
      <p>
        Puedes validar tu boleto aquí:<br/>
        <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer">${verifyUrl}</a>
      </p>
      <p>¡Gracias por tu compra!</p>
    </div>
  `;

  const attachments = [];
  if (pdfPath && fs.existsSync(pdfPath)) {
    attachments.push({
      filename: `boleto-${ticketId}.pdf`,
      path: pdfPath,
      contentType: 'application/pdf',
    });
  }

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html,
    attachments,
  });

  return info;
}

export default { sendTicketEmail };
