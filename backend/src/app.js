// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import db, { insertTicket, getTicket, markUsed } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ==== ENTORNO ====
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const ISSUE_KEY = process.env.ISSUE_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Correo (SMTP)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
const SMTP_USER = process.env.SES_SMTP_USER || process.env.SMTP_USER || ''; // compatibles si cambias a SES
const SMTP_PASS = process.env.SES_SMTP_PASS || process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Boletera <no-reply@boletera.local>';
const MAIL_BCC  = process.env.MAIL_BCC || ''; // opcional
const MAIL_ADMIN = process.env.MAIL_ADMIN || ''; // <-- NUEVO: correo del administrador (tú)

const mailEnabled = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS;
let transporter = null;
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log('[mail] transporte SMTP activo @', SMTP_HOST, `:${SMTP_PORT}`);
} else {
  console.log('[mail] SMTP no configurado (se omiten envíos hasta definir variables).');
}

if (process.env.MP_ACCESS_TOKEN) {
  console.log('[mercadoPago] Usando SDK v2 (token presente)');
} else {
  console.log('[mercadoPago] Sin MP_ACCESS_TOKEN; emisión directa habilitada únicamente');
}

// ==== ESTÁTICOS (si hay frontend) ====
const distDir = path.resolve(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('[estático] sirviendo frontend/dist');
} else {
  console.log('[estático] sin frontend/dist; sólo API');
}

// ==== HELPERS ====
function requireIssueKey(req, res) {
  const key = req.get('X-Issue-Key') || '';
  if (!ISSUE_KEY) {
    return res.status(500).json({ ok: false, error: 'ISSUE_KEY no configurada en servidor' });
  }
  if (key !== ISSUE_KEY) {
    return res.status(401).json({ ok: false, error: 'X-Issue-Key inválida' });
  }
  return null;
}
const uuid = () => crypto.randomUUID();

async function sendMail({ to, subject, text, html, bcc }) {
  if (!mailEnabled || !transporter) {
    console.log('[mail] envío omitido (SMTP no configurado). Destinatario habría sido:', to);
    return { ok: false, skipped: true };
  }
  const mailOptions = {
    from: MAIL_FROM,
    to,
    bcc: bcc || (MAIL_BCC ? MAIL_BCC : undefined),
    subject,
    text,
    html,
  };
  const info = await transporter.sendMail(mailOptions);
  console.log('[mail] enviado:', info.messageId, '->', to);
  return { ok: true, id: info.messageId };
}

// ==== RUTAS BÁSICAS ====
app.get('/health', (_req, res) => {
  res.json({ ok: true, db: !!db, mail: !!mailEnabled, now: new Date().toISOString() });
});

app.get('/__routes', (_req, res) => {
  const routes = [];
  app._router.stack.forEach((m) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).join(',').toUpperCase();
      routes.push({ methods, path: m.route.path });
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h) => {
        const route = h.route;
        if (route) {
          const methods = Object.keys(route.methods).join(',').toUpperCase();
          routes.push({ methods, path: route.path });
        }
      });
    }
  });
  res.json(routes);
});

// Diagnóstico BD
app.get('/api/dev/db-info', (_req, res) => {
  try {
    const table = db.prepare(`PRAGMA table_info(tickets);`).all();
    const idx   = db.prepare(`PRAGMA index_list('tickets');`).all();
    const trg   = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='tickets';`).all();
    const one   = db.prepare(`SELECT * FROM tickets ORDER BY created_at DESC LIMIT 1;`).get();
    res.json({ ok: true, table, idx, trg, latest: one || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'PRAGMA failed', detail: String(e) });
  }
});

// ==== EMITIR TICKET ====
app.post('/api/tickets/issue', async (req, res) => {
  const authError = requireIssueKey(req, res);
  if (authError) return;

  try {
    const {
      buyer_name,
      buyer_email,
      buyer_phone = '',
      function_id,
      function_label,
      event_title,
      currency = 'MXN',
      price = 0,
      payment_id = null,
    } = req.body || {};

    if (!buyer_name || !buyer_email || !function_id || !function_label || !event_title) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos: buyer_name, buyer_email, function_id, function_label, event_title son obligatorios',
        received: req.body,
      });
    }

    const id = req.body?.id || uuid();
    const savedId = insertTicket({
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
    });

    const url = `${BASE_URL}/t/${savedId}`;

    // 1) Correo al comprador
    (async () => {
      try {
        const subject = `🎟️ Tus boletos: ${event_title} — ${function_label}`;
        const plain = [
          `¡Gracias por tu compra, ${buyer_name}!`,
          ``,
          `Evento: ${event_title}`,
          `Función: ${function_label}`,
          `Precio: ${price} ${currency}`,
          ``,
          `Tu boleto: ${url}`,
          ``,
          `Presenta el código/URL en la entrada. Si tienes dudas, responde a este correo.`,
        ].join('\n');

        const html = `
          <div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto">
            <h2>🎟️ ${event_title}</h2>
            <p><strong>Función:</strong> ${function_label}</p>
            <p><strong>Comprador:</strong> ${buyer_name} — ${buyer_email}</p>
            <p><strong>Precio:</strong> ${price} ${currency}</p>
            <p><a href="${url}" target="_blank" rel="noopener">Abrir mi boleto</a></p>
            <hr/>
            <p style="font-size:12px;color:#666">Guarda este correo. Presenta el código/URL en la entrada.</p>
          </div>
        `;
        await sendMail({ to: buyer_email, subject, text: plain, html });
      } catch (e) {
        console.error('[mail] error al enviar confirmación comprador:', e);
      }
    })();

    // 2) Correo de **administración** (para ti) como entrante NO leído
    (async () => {
      if (!MAIL_ADMIN) return;
      try {
        const subject = `🧾 Nueva emisión: ${event_title} — ${function_label}`;
        const lines = [
          `Se emitió un boleto.`,
          ``,
          `ID: ${savedId}`,
          `Evento: ${event_title}`,
          `Función: ${function_label}`,
          `Comprador: ${buyer_name} <${buyer_email}>`,
          `Precio: ${price} ${currency}`,
          ``,
          `Ticket: ${url}`,
        ];
        await sendMail({
          to: MAIL_ADMIN,
          subject,
          text: lines.join('\n'),
          html: `
            <div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto">
              <h3>🧾 Nueva emisión</h3>
              <p><strong>ID:</strong> ${savedId}</p>
              <p><strong>Evento:</strong> ${event_title}</p>
              <p><strong>Función:</strong> ${function_label}</p>
              <p><strong>Comprador:</strong> ${buyer_name} — ${buyer_email}</p>
              <p><strong>Precio:</strong> ${price} ${currency}</p>
              <p><a href="${url}" target="_blank" rel="noopener">Abrir ticket</a></p>
            </div>
          `,
        });
      } catch (e) {
        console.error('[mail][admin] error al enviar aviso admin:', e);
      }
    })();

    return res.json({ ok: true, id: savedId, url });
  } catch (e) {
    console.error('issue error:', e);
    let table = [], idx = [], trg = [];
    try { table = db.prepare(`PRAGMA table_info(tickets);`).all(); } catch {}
    try { idx   = db.prepare(`PRAGMA index_list('tickets');`).all(); } catch {}
    try { trg   = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='tickets';`).all(); } catch {}
    return res.status(500).json({
      ok: false,
      error: 'No se pudo emitir',
      detail: String(e),
      schema: { table, idx, trg },
      body: req.body || null,
    });
  }
});

// ==== DEMO ====
app.post('/api/dev/issue-demo', (req, res) => {
  const authError = requireIssueKey(req, res);
  if (authError) return;

  try {
    const id = uuid();
    const savedId = insertTicket({
      id,
      buyer_name: 'Demo',
      buyer_email: 'demo@example.com',
      buyer_phone: '0000000000',
      function_id: 'funcion-demo',
      function_label: 'Función Demo — Hoy 20:00',
      event_title: 'Los Miserables (Demo)',
      currency: 'MXN',
      price: 1,
      payment_id: null,
    });
    const url = `${BASE_URL}/t/${savedId}`;

    (async () => {
      try {
        await sendMail({
          to: 'demo@example.com',
          subject: `🎟️ Boleto demo — ${savedId}`,
          text: `Boleto demo: ${url}`,
          html: `<p>Boleto demo: <a href="${url}">${url}</a></p>`,
        });
      } catch (e) {
        console.error('[mail][demo] error:', e);
      }
    })();

    return res.json({ ok: true, id: savedId, url });
  } catch (e) {
    console.error('issue-demo error:', e);
    let table = [], idx = [], trg = [];
    try { table = db.prepare(`PRAGMA table_info(tickets);`).all(); } catch {}
    try { idx   = db.prepare(`PRAGMA index_list('tickets');`).all(); } catch {}
    try { trg   = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='tickets';`).all(); } catch {}
    return res.status(500).json({
      ok: false,
      error: 'No se pudo emitir (demo)',
      detail: String(e),
      schema: { table, idx, trg }
    });
  }
});

// ==== MARCAR COMO USADO ====
app.post('/api/tickets/:id/use', (req, res) => {
  const { id } = req.params || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Falta id' });

  const ok = markUsed(id);
  const t = getTicket(id);
  return res.json({ ok, id, used: !!t?.used });
});

// ==== VISTA TICKET ====
app.get('/t/:id', (req, res) => {
  const { id } = req.params;
  const t = getTicket(id);
  if (!t) {
    return res.status(404).send(`<html><body><h1>Ticket no encontrado</h1><p>ID: ${id}</p></body></html>`);
  }

  const usedLabel = t.used ? 'Usado' : 'No usado';
  const btnLabel = t.used ? 'Usado' : 'Marcar como usado';

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${id}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, Arial, sans-serif; margin: 2rem; }
    .card { max-width: 640px; border: 1px solid #ddd; border-radius: 12px; padding: 16px; }
    .row { margin: 8px 0; }
    .status { font-weight: bold; }
    button { padding: 10px 14px; border-radius: 10px; border: 0; cursor: pointer; }
    button.primary { background:#111; color:#fff; }
    button[disabled] { opacity: .6; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${t.event_title}</h1>
    <div class="row"><strong>Función:</strong> ${t.function_label}</div>
    <div class="row"><strong>Comprador:</strong> ${t.buyer_name} — ${t.buyer_email}</div>
    <div class="row"><strong>Precio:</strong> ${t.price} ${t.currency}</div>
    <div class="row status">Estado: <span id="st">${usedLabel}</span></div>
    <div class="row">
      <button id="btn" class="primary" ${t.used ? 'disabled' : ''}>${btnLabel}</button>
    </div>
    <div class="row"><small>ID: ${id}</small></div>
  </div>

  <script>
  const btn = document.getElementById('btn');
  const st = document.getElementById('st');

  if (btn) {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const r = await fetch('/api/tickets/${id}/use', { method: 'POST' });
        const j = await r.json();
        if (j.ok && j.used) {
          st.textContent = 'Usado';
          btn.textContent = 'Usado';
        } else {
          btn.disabled = false;
          alert('No se pudo marcar como usado');
        }
      } catch (e) {
        btn.disabled = false;
        alert('Error: ' + e);
      }
    });
  }
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ==== 404 ====
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// ==== LISTEN ====
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${BASE_URL}`);
});
