import nodemailer from 'nodemailer';

export function makeTransport() {
  const {
    SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
  } = process.env;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 465),
    secure: String(SMTP_SECURE || 'true') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

export async function sendTicketEmail({ to, subject, html, attachments }) {
  const transporter = makeTransport();
  const { SENDER_NAME = 'Boletera', SENDER_EMAIL } = process.env;
  return transporter.sendMail({
    from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
    to,
    subject,
    html,
    attachments
  });
}
