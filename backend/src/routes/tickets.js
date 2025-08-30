import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js'; // <-- IMPORT CORREGIDO (nombrado)
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../mailer.js';

const router = Router();

/* ---------------------- DB bootstrap ---------------------- */

db.prepare(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    buyer_name   TEXT,
    buyer_email  TEXT,
    buyer_phone  TEXT,
    function_id  TEXT,
    function_label TEXT,
    event_title  TEXT,
    currency     TEXT,
    price        REAL,
    payment_id   TEXT,        -- para idempotencia
    issued_at    TEXT DEFAULT (datetime('now')),
    used_at      TEXT
  );
`).run();

db.prepare(`
  CREATE UNIQUE INDEX IF NOT EXISTS ux_tickets_payment
  ON tickets (payment_id)
  WHERE payment_id IS NOT NULL;
`).run();

/* --------------------- helpers / config ------------------- */

function baseUrl() {
  return process.env.BASE_URL || 'http://localhost:8080';
}

/**
 * Si está definido process.env.ISSUE_API_KEY, exige cabecera X-Api-Key igual.
 */
function assertApiKey(req) {
  const key = process.env.ISSUE_API_KEY;
  if (!key) return; // sin guardia
  const hdr = req.header('X-Api-Key') || '';
  if (hdr !== key) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

/* ------------------------- routes ------------------------- */

/**
 * POST /api/tickets/issue
 * Emite un boleto (idempotente por payment_id).
 * Si ya existe un ticket con ese payment_id: responde { ok:true, id, reused:true } sin re-enviar correo.
 */
router.post('/issue', async (req, res) => {
  try {
    assertApiKey(req);

    const {
      id,
      buyer_name = '—',
      buyer_email = '',
      buyer_phone = '',
      function_id = 'funcion-1',
      function_label = 'Función',
      event_title = process.env.EVENT_TITLE || 'Evento',
      currency = process.env.CURRENCY || 'MXN',
      price = Number(process.env.PRICE_GENERAL || 0),
      payment_id = null,
    } = req.body || {};

    // Idempotencia por payment_id
    if (payment_id) {
      const found = db
        .prepare('SELECT id FROM tickets WHERE payment_id = ?')
        .get(String(payment_id));
      if (found?.id) {
        return res.json({ ok: true, id: found.id, reused: true });
      }
    }

    const ticketId = id || uuidv4();
    db.prepare(
      `INSERT INTO tickets
        (id, buyer_name, buyer_email, buyer_phone, function_id, function_label,
         event_title, currency, price, payment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticketId,
      buyer_name,
      buyer_email,
      buyer_phone,
      function_id,
      function_label,
      event_title,
      currency,
      Number(price) || 0,
      payment_id ? String(payment_id) : null
    );

    // PDF
    const verifyUrl = `${baseUrl()}/t/${ticketId}`;
    const pdfPath = await createTicketPDF({
      ticket: {
        id: ticketId,
        buyer_name,
        buyer_email,
        buyer_phone,
        function_id,
        function_label,
        event_title,
        currency,
        price: Number(price) || 0,
      },
      baseUrl: baseUrl(),
      senderName: process.env.SENDER_NAME || 'Boletera',
    });

    // Email
    if (buyer_email) {
      await sendTicketEmail({
        to: buyer_email,
        name: buyer_name || '',
        subject:
          process.env.MAIL_SUBJECT ||
          `Tus boletos – ${event_title} (${function_label})`,
        ticketId,
        function_label,
        event_title,
        currency,
        price: Number(price) || 0,
        verifyUrl,
        pdfPath,
      });
    }

    return res.json({ ok: true, id: ticketId });
  } catch (err) {
    const status = err.status || 500;
    console.warn('[tickets/issue] WARN:', err?.message || err);
    return res.status(status).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
});

/**
 * POST /api/tickets/:id/use
 * Marca un boleto como usado (si no lo estaba).
 */
router.post('/:id/use', (req, res) => {
  const id = String(req.params.id || '');
  const row = db
    .prepare('SELECT used_at FROM tickets WHERE id = ?')
    .get(id);

  if (!row) {
    return res.status(404).json({ ok: false, error: 'ticket_not_found' });
  }
  if (row.used_at) {
    return res.json({ ok: true, already_used: true, used_at: row.used_at });
  }

  db.prepare(
    "UPDATE tickets SET used_at = datetime('now') WHERE id = ?"
  ).run(id);

  return res.json({ ok: true, used: true });
});

export default router;
