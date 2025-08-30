import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT || 465);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const senderEmail = process.env.SENDER_EMAIL || user;
const senderName  = process.env.SENDER_NAME  || 'Boletera';

if (!user || !pass) {
  console.warn('[mailer] SMTP_USER/SMTP_PASS no configurados. El envío de correo fallará.');
}

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true para 465 (Gmail recomendado), false para 587
  auth: { user, pass },
  // En algunos hosts puede ser útil esto; en Gmail no es estrictamente necesario:
  // tls: { rejectUnauthorized: false },
});

export async function sendMail({ to, subject, text, html, attachments = [] }) {
  const from = `"${senderName}" <${senderEmail}>`;
  const info = await transporter.sendMail({ from, to, subject, text, html, attachments });
  return info;
}
