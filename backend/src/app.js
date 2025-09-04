// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db, { insertTicket, getTicket, markUsed } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ==== LOGS DE ARRANQUE / ENTORNO ====
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const ISSUE_KEY = process.env.ISSUE_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

if (process.env.MP_ACCESS_TOKEN) {
  console.log('[mercadoPago] Usando SDK v2 (token presente)');
} else {
  console.log('[mercadoPago] Sin MP_ACCESS_TOKEN; emisión directa habilitada únicamente');
}

// ==== SERVIR FRONTEND SI EXISTE ====
const distDir = path.resolve(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('[estático] sirviendo frontend/dist');
} else {
  console.log('[estático] sin frontend/dist; sólo API');
}

// ==== UTILES ====
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

function uuid() {
  return crypto.randomUUID();
}

// ==== RUTAS BASICAS ====
app.get('/health', (_req, res) => {
  res.json({ ok: true, db: !!db, now: new Date().toISOString() });
});

// Lista de rutas
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

// ==== EMITIR TICKET (emisión directa) ====
app.post('/api/tickets/issue', async (req, res) => {
  const authError = requireIssueKey(req, res);
  if (authError) return;

  try {
    // Log de diagnóstico
    console.log('[issue] body recibido:', req.body);

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
        error:
          'Faltan campos: buyer_name, buyer_email, function_id, function_label, event_title son obligatorios',
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

    return res.json({ ok: true, id: savedId, url: `${BASE_URL}/t/${savedId}` });
  } catch (e) {
    console.error('issue error:', e);
    return res
      .status(500)
      .json({ ok: false, error: 'No se pudo emitir', detail: String(e), body: req.body || null });
  }
});

// ==== ENDPOINT DE DEMO PARA PROBAR EMISIÓN SIN PENSAR EN EL BODY ====
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
    return res.json({ ok: true, id: savedId, url: `${BASE_URL}/t/${savedId}` });
  } catch (e) {
    console.error('issue-demo error:', e);
    return res
      .status(500)
      .json({ ok: false, error: 'No se pudo emitir (demo)', detail: String(e) });
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

// ==== VISTA MUY SIMPLE DEL TICKET ====
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

// ==== CATCH-ALL (404) ====
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// ==== LISTEN ====
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${BASE_URL}`);
});
