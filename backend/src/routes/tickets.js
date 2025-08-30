import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  insertTicket,
  getTicket,
  markUsed,
  getTicketByPaymentId,
} from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendMail } from '../mailer.js';

const router = Router();

/**
 * POST /api/tickets/issue
 * Emite PDF + correo y guarda en BD.
 * - Si viene payment_id y ya existe, NO duplica (idempotente).
 * - Si no viene id, lo genera.
 */
router.post('/issue', async (req, res) => {
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
      payment_id, // opcional (ideal cuando lo dispara el webhook)
    } = req.body || {};

    if (!buyer_email) {
      return res.status(400).json({ ok: false, error: 'buyer_email_required' });
    }
    if (!function_id || !function_label) {
      return res.status(400).json({ ok: false, error: 'function_required' });
    }

    if (payment_id) {
      const already = getTicketByPaymentId(String(payment_id));
      if (already) {
        return res.json({ ok: true, id: already.id, duplicated: true });
      }
    }

    const ticketId = id || uuidv4();

    // Inserta (si ya existía por PK, ignoramos el constraint y seguimos)
    try {
      insertTicket({
        id: ticketId,
        buyer_name: buyer_name || '—',
        buyer_email,
        buyer_phone: buyer_phone || '',
        function_id,
        function_label,
        event_title: event_title || process.env.EVENT_TITLE || 'Evento',
        currency: currency || process.env.CURRENCY || 'MXN',
        price: Number(price || process.env.PRICE_GENERAL || 0) || 0,
        payment_id: payment_id ? String(payment_id) : null,
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('SQLITE_CONSTRAINT')) {
        console.error('[tickets/issue] DB insert error:', e);
        return res.status(500).json({ ok: false, error: 'db_insert_failed' });
      }
      // si fue constraint (duplicado), continuamos a generar/enviar PDF
    }

    const baseUrl = process.env.BASE_URL;
    const filePath = await createTicketPDF({
      ticket: {
        id: ticketId,
        buyer_name: buyer_name || '—',
        buyer_email,
        buyer_phone: buyer_phone || '',
        function_id,
        function_label,
        event_title: event_title || process.env.EVENT_TITLE || 'Evento',
        currency: currency || process.env.CURRENCY || 'MXN',
        price: Number(price || process.env.PRICE_GENERAL || 0) || 0,
      },
      baseUrl,
      senderName: process.env.SENDER_NAME || 'Boletera',
    });

    await sendMail({
      to: buyer_email,
      subject: `Tus boletos – ${event_title || process.env.EVENT_TITLE || 'Evento'}`,
      text: `¡Gracias! Adjuntamos tus boletos.\n\nSi no puedes ver el PDF, responde a este correo.`,
      attachments: [{ filename: `boleto-${ticketId}.pdf`, path: filePath }],
    });

    return res.json({ ok: true, id: ticketId });
  } catch (err) {
    console.error('[tickets/issue] ERROR:', err?.message || err);
    return res
      .status(500)
      .json({ ok: false, error: 'issue_failed', details: String(err?.message || err) });
  }
});

// GET /api/tickets/:id
router.get('/:id', (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
  return res.json({ ok: true, ticket: t });
});

// POST /api/tickets/:id/use
router.post('/:id/use', (req, res) => {
  const r = markUsed(req.params.id);
  return res.json({ ok: true, changes: r.changes || 0 });
});

export default router;
