// backend/src/pdf.js
import PDFDocument from 'pdfkit';
import { generateQR } from './qrcode.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guardamos PDFs en ruta escribible:
 *  - En Render: /tmp/boletera-data/tmp (persistirá mientras el servicio esté corriendo)
 *  - Local: usa DATA_DIR si está definido; si no, ./tmp
 */
const BASE_DIR = process.env.DATA_DIR || '/tmp/boletera-data';
const TMP_DIR = process.env.TMP_DIR || path.join(BASE_DIR, 'tmp');

fs.mkdirSync(TMP_DIR, { recursive: true });

export async function createTicketPDF({
  ticket,
  baseUrl,
  senderName = 'Boletera',
}) {
  // QR / URL de validación (si es ngrok, agregamos el bypass del banner)
  const verifyUrl = baseUrl && baseUrl.includes('ngrok')
    ? `${baseUrl}/t/${ticket.id}?ngrok-skip-browser-warning=1`
    : `${baseUrl}/t/${ticket.id}`;

  const qrDataUrl = await generateQR(verifyUrl);

  const doc = new PDFDocument({ size: 'A6', margin: 16 });
  const filePath = path.join(TMP_DIR, `ticket-${ticket.id}.pdf`);
  const stream = doc.pipe(fs.createWriteStream(filePath));

  // Encabezado
  doc.fontSize(16).text(ticket.function_label || 'Función', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(ticket.event_title || 'Evento', { align: 'center' });
  doc.moveDown(0.5);

  // Detalles
  doc.fontSize(10);
  doc.text(`Nombre: ${ticket.buyer_name || '—'}`);
  doc.text(`Correo: ${ticket.buyer_email || '—'}`);
  doc.text(`Función: ${ticket.function_label || '—'}`);
  doc.text(`Boleto: ${ticket.id}`);
  if (ticket.price != null && ticket.currency) {
    doc.text(`Precio: ${ticket.price} ${ticket.currency}`);
  }
  doc.moveDown(0.5);

  // QR
  const pngB64 = (qrDataUrl || '').replace(/^data:image\/png;base64,/, '');
  if (pngB64) {
    doc.image(Buffer.from(pngB64, 'base64'), { fit: [200, 200], align: 'center', valign: 'center' });
    doc.moveDown(0.5);
  }
  doc.fontSize(8).text(verifyUrl, { align: 'center' });

  // Footer
  doc.moveDown(0.5);
  doc.fontSize(8).text(`Enviado por ${senderName}`, { align: 'center' });

  doc.end();

  await new Promise((res, rej) => {
    stream.on('finish', res);
    stream.on('error', rej);
  });

  return filePath;
}
