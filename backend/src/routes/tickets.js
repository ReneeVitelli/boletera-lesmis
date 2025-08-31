import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../mailer.js';

const router = Router();

/** Middleware SOLO para rutas protegidas (emisión) */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = process.env.ISSUE_API_KEY;
  if (!expected) {
    console.error('[tickets] Falta ISSUE_API_KEY en variables de entorno');
    return res.status(500).json({ error: 'server_misconfigured' });
  }
  if (key !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

/**
 * POST /api/tickets/issue
 * Emite boletos (protegido por API KEY)
 */
router.post('/issue', requireApiKey, async (req, res) => {
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
      payment_id,
      quantity = 1,
    } = req.body || {};

    if (!buyer_email) {
      return res.status(400).json({ error: 'missing_email' });
    }

    const ticketId = id || uuidv4();

    // Inserta en DB
    const stmt = db.prepare(
      `INSERT INTO tickets 
       (id, buyer_name, buyer_email, buyer_phone, function_id, function_label, event_title, currency, price, payment_id, used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    );
    stmt.run(
      ticketId,
      buyer_name || '—',
      buyer_email,
      buyer_phone || '',
      function_id || 'funcion-1',
      function_label || 'Función',
      event_title || process.env.EVENT_TITLE || 'Evento',
      currency || process.env.CURRENCY || 'MXN',
      price || process.env.PRICE_GENERAL || 0,
      payment_id || null
    );

    // Genera PDF
    const filePath = await createTicketPDF({
      ticket: {
        id: ticketId,
        buyer_name,
        buyer_email,
        buyer_phone,
        function_id,
        function_label,
        event_title,
        currency,
        price,
      },
      baseUrl: process.env.BASE_URL || 'http://localhost:8080',
      senderName: 'Boletera',
    });

    // Envía correo
    await sendTicketEmail(buyer_email, filePath);

    console.log('[tickets] boleto emitido:', ticketId);
    return res.json({ ok: true, id: ticketId });
  } catch (err) {
    console.error('[tickets] ERROR:', err);
    return res.status(500).json({ error: 'issue_failed', details: String(err) });
  }
});

/**
 * POST /api/tickets/:id/use
 * Marcar boleto como usado (SIN API KEY para poder hacerlo desde el navegador)
 */
router.post('/:id/use', (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('UPDATE tickets SET used = 1 WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    return res.json({ ok: true, id, used: 1 });
  } catch (err) {
    console.error('[tickets/use] ERROR:', err);
    return res.status(500).json({ error: 'use_failed' });
  }
});

export default router;
