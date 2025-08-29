import PDFDocument from 'pdfkit';
import { generateQR } from './qrcode.js';
import fs from 'node:fs';

export async function createTicketPDF({
  ticket,
  baseUrl,
  senderName = 'Boletera',
}) {
  // URL limpia (Cloudflare, sin parámetros extra)
  const verifyUrl = `${baseUrl}/t/${ticket.id}`;
  const qrDataUrl = await generateQR(verifyUrl);

  const doc = new PDFDocument({ size: 'A6', margin: 16 });
  const filePath = `./tmp/ticket-${ticket.id}.pdf`;
  fs.mkdirSync('./tmp', { recursive: true });
  const stream = doc.pipe(fs.createWriteStream(filePath));

  // Encabezado
  doc.fontSize(16).text(ticket.function_label, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(ticket.event_title || 'Evento', { align: 'center' });
  doc.moveDown(0.5);

  // Detalles
  doc.fontSize(10);
  doc.text(`Nombre: ${ticket.buyer_name || '—'}`);
  doc.text(`Correo: ${ticket.buyer_email || '—'}`);
  doc.text(`Función: ${ticket.function_label}`);
  doc.text(`Boleto: ${ticket.id}`);
  doc.text(`Precio: ${ticket.price} ${ticket.currency}`);
  doc.moveDown(0.5);

  // QR
  const pngBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  doc.image(Buffer.from(pngBase64, 'base64'), {
    fit: [200, 200],
    align: 'center',
    valign: 'center'
  });

  // Enlace clicable corto
  doc.moveDown(0.5);
  doc.fontSize(9);
  doc.fillColor('#1155cc'); // color de enlace
  doc.text('Validar boleto', {
    align: 'center',
    link: verifyUrl,      // <— hace el texto clicable hacia la URL completa
    underline: true
  });
  doc.fillColor('black');

  // (Opcional) Si quieres también imprimir la URL completa en chiquito, descomenta esto:
  // doc.moveDown(0.2);
  // doc.fontSize(7).text(verifyUrl, { align: 'center' });

  // Footer
  doc.moveDown(0.5);
  doc.fontSize(8).text(`Enviado por ${senderName}`, { align: 'center' });

  doc.end();

  await new Promise((res) => stream.on('finish', res));
  return filePath;
}
