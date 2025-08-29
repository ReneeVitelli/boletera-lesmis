import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../email.js';

const router = Router();

// Crear boleto(s) (uso interno después de pago aprobado)
router.post('/issue', async (req, res) => {
  try {
    const { buyer_name, buyer_email, buyer_phone, function_id, function_label, quantity = 1, price, currency, event_title } = req.body;

    const insert = db.prepare(`INSERT INTO tickets (id, buyer_name, buyer_email, buyer_phone, function_id, function_label, price, currency)
                               VALUES (@id, @buyer_name, @buyer_email, @buyer_phone, @function_id, @function_label, @price, @currency)`);

    const issued = [];
    for (let i = 0; i < Number(quantity); i++) {
      const id = crypto.randomUUID();
      const ticket = { id, buyer_name, buyer_email, buyer_phone, function_id, function_label, price, currency, event_title };
      insert.run(ticket);

      const pdfPath = await createTicketPDF({ ticket, baseUrl: process.env.BASE_URL, senderName: process.env.SENDER_NAME });

      if (buyer_email) {
        await sendTicketEmail({
          to: buyer_email,
          subject: `Tu boleto – ${function_label}`,
          html: `<p>Hola ${buyer_name || ''},</p>
                 <p>Adjuntamos tu boleto para <strong>${event_title || 'el evento'}</strong>.<br>
                 Presenta el QR en la entrada.</p>
                 <p>Boleto: ${id}</p>`,
          attachments: [{ filename: `boleto-${id}.pdf`, path: pdfPath }]
        });
      }

      issued.push({ id });
    }

    res.json({ ok: true, issued });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Obtener estado de boleto
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const sel = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!sel) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, ticket: sel });
});

// Validar (marcar como usado)
router.post('/:id/use', (req, res) => {
  const { id } = req.params;
  const sel = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!sel) return res.status(404).json({ ok: false, error: 'not_found' });
  if (sel.status === 'used') return res.json({ ok: false, status: 'used', used_at: sel.used_at });
  db.prepare("UPDATE tickets SET status = 'used', used_at = datetime('now') WHERE id = ?").run(id);
  const upd = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  return res.json({ ok: true, status: 'used', ticket: upd });
});

export default router;
