// backend/src/routes/tickets.js
import { Router } from 'express';
import db from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../mailer.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/** Emisión manual/administrativa (protegida por x-api-key si está configurada) */
router.post('/issue', async (req, res) => {
  try {
    // Seguridad opcional por API key
    const requiredKey = (process.env.ISSUE_API_KEY || '').trim();
    const givenKey = (req.get('x-api-key') || '').trim();
    if (requiredKey && givenKey !== requiredKey) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const {
      id,
      buyer_name,
      buyer_email,
      buyer_phone,
      function_id,
      function_label,
      event_title,
      price,
      currency,
      payment_id, // opcional
    } = req.body || {};

    const ticket = {
      id: id || uuidv4(),
      buyer_name: (buyer_name || '').trim(),
      buyer_email: (buyer_email || '').trim(),
      buyer_phone: (buyer_phone || '').trim(),
      function_id: (function_id || 'funcion-1').trim(),
      function_label: (function_label || 'Función').trim(),
      event_title: (event_title || process.env.EVENT_TITLE || 'Evento').trim(),
      price: Number(price || process.env.PRICE_GENERAL || 0),
      currency: (currency || process.env.CURRENCY || 'MXN').trim(),
      payment_id: payment_id ? String(payment_id) : null,
      used: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Idempotencia por payment_id si viene
    if (ticket.payment_id) {
      const existing = db.prepare('SELECT id FROM tickets WHERE payment_id = ?').get(ticket.payment_id);
      if (existing) {
        return res.json({ ok: true, id: existing.id, reused: true });
      }
    }

    // Inserta
    const insert = db.prepare(`
      INSERT INTO tickets (id, buyer_name, buyer_email, buyer_phone, function_id, function_label,
                           event_title, price, currency, used, payment_id, created_at, updated_at)
      VALUES (@id, @buyer_name, @buyer_email, @buyer_phone, @function_id, @function_label,
              @event_title, @price, @currency, @used, @payment_id, @created_at, @updated_at)
    `);
    insert.run(ticket);

    // Genera PDF
    const baseUrl = (process.env.PUBLIC_BASE_URL || '').trim() || (process.env.BASE_URL || '').trim() || '';
    const senderName = process.env.SENDER_NAME || 'Boletera';
    const pdfPath = await createTicketPDF({ ticket, baseUrl, senderName });

    // Asegura destinatario ANTES de enviar
    const resolvedTo =
      ticket.buyer_email ||
      (process.env.SENDER_EMAIL || '').trim() ||
      (process.env.SMTP_USER || '').trim();

    console.log('[tickets] destinatario resuelto =', resolvedTo || '(vacío)');

    const html = `
      <p>¡Gracias por tu compra!</p>
      <p><b>${ticket.event_title}</b><br/>
      ${ticket.function_label}</p>
      <p><b>Boleto:</b> ${ticket.id}</p>
      <p>Puedes presentar el QR en la entrada. También puedes validar aquí:<br/>
      <a href="${baseUrl}/t/${ticket.id}">${baseUrl}/t/${ticket.id}</a></p>
    `;

    // Envía correo (mailer.js también valida y hace fallback)
    const subject = `Tus boletos – ${ticket.event_title}`;
    await sendTicketEmail({
      to: resolvedTo,
      subject,
      html,
      attachments: [
        {
          filename: `boleto-${ticket.id}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf',
        },
      ],
    });

    return res.json({ ok: true, id: ticket.id });
  } catch (err) {
    console.error('[tickets] ERROR:', err?.message || err);
    return res.status(500).json({ error: 'issue_failed', details: String(err?.message || err) });
  }
});

/** Marca ticket como usado */
router.post('/:id/use', async (req, res) => {
  try {
    const tid = (req.params?.id || '').trim();
    if (!tid) return res.status(400).json({ error: 'bad_request' });

    const row = db.prepare('SELECT id, used FROM tickets WHERE id = ?').get(tid);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (Number(row.used) === 1) {
      return res.json({ ok: true, id: tid, already: true });
    }

    db.prepare('UPDATE tickets SET used = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), tid);
    return res.json({ ok: true, id: tid, used: true });
  } catch (err) {
    console.error('[tickets/use] ERROR:', err?.message || err);
    return res.status(500).json({ error: 'use_failed', details: String(err?.message || err) });
  }
});

export default router;
