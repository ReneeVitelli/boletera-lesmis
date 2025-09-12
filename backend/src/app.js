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
const SMTP_USER = process.env.SES_SMTP_USER || process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SES_SMTP_PASS || process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Boletera <no-reply@boletera.local>';
const MAIL_BCC  = process.env.MAIL_BCC || '';
const MAIL_ADMIN = process.env.MAIL_ADMIN || '';

// Branding (logos adaptativos)
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || ''; // logo oscuro p/ fondos claros
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || ''; // logo claro p/ fondos oscuros

// ==== MAIL ====
const mailEnabled = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS;
let transporter = null;
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log('[ correo ] transporte SMTP activo@' + SMTP_HOST + ' :' + SMTP_PORT);
} else {
  console.log('[correo] SMTP no configurado (sin envíos).');
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
    console.log('[mail] (omitido) ->', to, subject);
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

    // 2) Correo de administración (para ti)
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

// ==== VISTA TICKET (DISEÑO + LOGOS ADAPTATIVOS) ====
app.get('/t/:id', (req, res) => {
  const { id } = req.params;
  const t = getTicket(id);
  if (!t) {
    return res.status(404).send(`<html><body><h1>Ticket no encontrado</h1><p>ID: ${id}</p></body></html>`);
  }

  const used = !!t.used;
  const usedLabel = used ? 'Usado' : 'No usado';
  const btnLabel = used ? 'Usado' : 'Marcar como usado';

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${t.event_title} — Ticket</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#111827"/>
  <style>
    :root{
      --bg:#0b0e14;
      --panel:#111827; 
      --muted:#6b7280; 
      --text:#e5e7eb; 
      --brand:#e11d48;
      --ok:#16a34a; 
      --warn:#f59e0b; 
      --border:rgba(255,255,255,.08);
    }
    *{box-sizing:border-box}
    body{margin:0;background:radial-gradient(1200px 600px at 20% -10%, rgba(225,29,72,.18), transparent), var(--bg); color:var(--text); font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;}
    .wrap{min-height:100svh; display:flex; align-items:center; justify-content:center; padding:24px;}
    .card{width:100%; max-width:720px; border:1px solid var(--border); background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)); border-radius:20px; overflow:hidden; box-shadow: 0 10px 30px rgba(0,0,0,.35)}
    .header{display:flex; align-items:center; gap:16px; padding:20px 24px; border-bottom:1px solid var(--border); background:linear-gradient(90deg, rgba(225,29,72,.08), transparent);}
    .logo{height:80px; width:auto; display:${(LOGO_URL_LIGHT || LOGO_URL_DARK) ? 'block' : 'none'}}
    .title{font-size:22px; font-weight:700; letter-spacing:.2px}
    .body{padding:22px 24px; display:grid; gap:14px}
    .row{display:flex; gap:8px; align-items:center; flex-wrap:wrap}
    .label{color:var(--muted); min-width:92px}
    .value{font-weight:600}
    .badge{display:inline-flex; align-items:center; gap:8px; font-weight:700; padding:8px 12px; border-radius:999px; border:1px solid var(--border);}
    .badge.ok{color:#d1fae5; background:rgba(22,163,74,.14); border-color:rgba(16,185,129,.25)}
    .badge.warn{color:#fff7ed; background:rgba(245,158,11,.14); border-color:rgba(245,158,11,.25)}
    .footer{display:flex; gap:10px; padding:20px 24px; border-top:1px solid var(--border); background:rgba(255,255,255,.02)}
    button{appearance:none; border:0; border-radius:12px; padding:12px 14px; font-weight:700; cursor:pointer}
    .btn-primary{background:#111; color:#fff; border:1px solid var(--border)}
    .btn-primary:hover{opacity:.9}
    .btn-outline{background:transparent; color:var(--text); border:1px solid var(--border)}
    .btn-outline:hover{background:rgba(255,255,255,.04)}
    .muted{color:var(--muted)}
    .id{font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; color:var(--muted)}
    @media (max-width: 520px){
      .label{min-width:auto}
      .header{padding:18px}
      .body{padding:18px}
      .footer{padding:18px}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <picture>
          ${(LOGO_URL_LIGHT || LOGO_URL_DARK) ? `
            <source srcset="${LOGO_URL_LIGHT}" media="(prefers-color-scheme: light)">
            <source srcset="${LOGO_URL_DARK}"  media="(prefers-color-scheme: dark)">
            <img class="logo" src="${LOGO_URL_DARK || LOGO_URL_LIGHT}" alt="logo">
          ` : ``}
        </picture>
        <div>
          <div class="title">${t.event_title}</div>
          <div class="muted">Boleto digital</div>
        </div>
        <div style="margin-left:auto">
          <span class="badge ${used ? 'ok' : 'warn'}">${used ? '✓ Usado' : '• No usado'}</span>
        </div>
      </div>

      <div class="body">
        <div class="row"><span class="label">Función</span> <span class="value">${t.function_label}</span></div>
        <div class="row"><span class="label">Comprador</span> <span class="value">${t.buyer_name} — ${t.buyer_email}</span></div>
        <div class="row"><span class="label">Precio</span> <span class="value">${t.price} ${t.currency}</span></div>
        <div class="row"><span class="label">Estado</span> <span id="st" class="value">${usedLabel}</span></div>
        <div class="row"><span class="label">ID</span> <span class="id">${id}</span></div>
      </div>

      <div class="footer">
        <button id="btn" class="btn-primary" ${used ? 'disabled' : ''}>${btnLabel}</button>
        <button id="copy" class="btn-outline">Copiar enlace</button>
        <button id="print" class="btn-outline">Imprimir</button>
        <div style="margin-left:auto" class="muted">Presenta este boleto en la entrada</div>
      </div>
    </div>
  </div>

  <script>
    const id = ${JSON.stringify(id)};
    const st = document.getElementById('st');
    const btn = document.getElementById('btn');
    const copy = document.getElementById('copy');
    const printBtn = document.getElementById('print');

    if (btn) {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const r = await fetch('/api/tickets/' + id + '/use', { method: 'POST' });
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

    copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copy.textContent = '¡Copiado!';
        setTimeout(() => (copy.textContent = 'Copiar enlace'), 2000);
      } catch (e) { alert('No se pudo copiar'); }
    });

    printBtn?.addEventListener('click', () => window.print());
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
