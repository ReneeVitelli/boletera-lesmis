// backend/src/routes/tickets.js
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { insertTicket } from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../mailer.js';

const router = Router();

// Middleware de autenticación para emisión (clave sencilla por header)
function requireIssueKey(req, res, next) {
  const expected = process.env.ISSUE_API_KEY || '';
  const got =
    req.get('X-API-Key') ||
    req.get('X-Issue-Key') || // compatibilidad con llamadas anteriores
    '';
  if (!expected || got !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

/**
 * POST /api/tickets/issue
 * Emite un boleto, genera PDF y envía correo.
 * Requiere cabecera: X-API-Key: <ISSUE_API_KEY>
 */
router.post('/issue', requireIssueKey, async (req, res) => {
  try {
    const {
      id,
      buyer_name,
      buyer_email,
      buyer_phone,
      function_id,
      function_label,
      event_title,
      currency,
      price,
      payment_id, // opcional (lo manda el webhook)
    } = req.body || {};

    if (!buyer_email || String(buyer_email).trim() === '') {
      return res.status(400).json({ error: 'missing_buyer_email' });
    }

    const ticketId = id || uuidv4();
    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    const senderName = process.env.SENDER_NAME || 'Boletera';

    // Insertamos en DB
    insertTicket({
      id: ticketId,
      buyer_name: buyer_name || '—',
      buyer_email: String(buyer_email).trim(),
      buyer_phone: buyer_phone || '',
      function_id: function_id || 'funcion-1',
      function_label:
        function_label || 'Función 1 - Jue 12 Sep 2025 19:00',
      event_title: event_title || process.env.EVENT_TITLE || 'Evento',
      currency: currency || process.env.CURRENCY || 'MXN',
      price: Number(price || process.env.PRICE_GENERAL || 0),
      used: 0,
      payment_id: payment_id ? String(payment_id) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Generamos PDF
    const pdfPath = await createTicketPDF({
      ticket: {
        id: ticketId,
        buyer_name: buyer_name || '—',
        buyer_email: String(buyer_email).trim(),
        function_label:
          function_label || 'Función 1 - Jue 12 Sep 2025 19:00',
        event_title: event_title || process.env.EVENT_TITLE || 'Evento',
        currency: currency || process.env.CURRENCY || 'MXN',
        price: Number(price || process.env.PRICE_GENERAL || 0),
      },
      baseUrl,
      senderName,
    });

    // Email
    const subject =
      `[Boleto] ${process.env.EVENT_TITLE || 'Evento'} – ${function_label || 'Función'}`;
    const text =
      `¡Gracias por tu compra!\n\n` +
      `Adjuntamos tu boleto (PDF). También puedes validarlo aquí:\n` +
      `${baseUrl}/t/${ticketId}\n\n` +
      `— ${senderName}`;

    await sendTicketEmail({
      to: String(buyer_email).trim(),
      subject,
      text,
      attachments: [
        {
          filename: `boleto-${ticketId}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf',
        },
      ],
    });

    return res.json({ ok: true, id: ticketId });
  } catch (err) {
    console.error('[tickets] ERROR:', err);
    return res.status(500).json({ error: 'issue_failed', details: String(err?.message || err) });
  }
});

/**
 * POST /api/tickets/:id/use
 * Marca un boleto como usado (podrías protegerlo con otra clave si quieres).
 */
router.post('/:id/use', async (req, res) => {
  try {
    const id = req.params.id;
    const ok = markUsed(id);
    return res.json({ ok });
  } catch (err) {
    console.error('[tickets/use] ERROR:', err);
    return res.status(500).json({ error: 'mark_failed', details: String(err?.message || err) });
  }
});

export default router;
