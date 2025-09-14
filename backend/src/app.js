// backend/src/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';

import db, { insertTicket, getTicket, markUsed } from './db.js';

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------- util ----------
function htmlesc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currencyMXN(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
}

// --------- health & rutas ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, db: true, mail: !!process.env.MAIL_USER, now: new Date().toISOString() });
});

app.get('/__routes', (req, res) => {
  res.json([
    { methods: 'GET', path: '/health' },
    { methods: 'GET', path: '/__routes' },
    { methods: 'POST', path: '/api/tickets/issue' },
    { methods: 'POST', path: '/api/dev/issue-demo' },
    { methods: 'POST', path: '/api/tickets/:id/use' },
    { methods: 'GET', path: '/t/:id' }
  ]);
});

// --------- API EMISIÓN ----------
app.post('/api/tickets/issue', async (req, res) => {
  try {
    const issueKey = process.env.ISSUE_KEY || process.env.ISSUE_API_KEY;
    const reqKey = req.get('X-Issue-Key') || req.query.key;
    if (!issueKey || reqKey !== issueKey) {
      res.status(401).json({ ok: false, error: 'ISSUE_KEY no configurada o inválida' });
      return;
    }

    const {
      id,
      buyer_name,
      buyer_email,
      buyer_phone = '',
      function_id,
      function_label,
      event_title = 'Los Miserables',
      currency = 'MXN',
      price = 0,
      payment_id = null,
      student_code = null,
    } = req.body || {};

    if (!id || !buyer_name || !buyer_email || !function_id || !function_label) {
      res.status(400).json({ ok: false, error: 'Faltan campos obligatorios' });
      return;
    }

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
      student_code,
    });

    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ ok: true, id: savedId, url: `${base}/t/${savedId}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'error emitiendo' });
  }
});

// DEMO
app.post('/api/dev/issue-demo', (req, res) => {
  const issueKey = process.env.ISSUE_KEY || process.env.ISSUE_API_KEY;
  const reqKey = req.get('X-Issue-Key') || req.query.key;
  if (!issueKey || reqKey !== issueKey) {
    res.status(401).json({ ok: false, error: 'ISSUE_KEY no configurada o inválida' });
    return;
  }
  const id = cryptoRandomId();
  insertTicket({
    id,
    buyer_name: 'Demo',
    buyer_email: 'demo@example.com',
    function_id: 'funcion-demo',
    function_label: 'Función Demo — Hoy 20:00',
    event_title: 'Los Miserables',
    currency: 'MXN',
    price: 1,
    payment_id: null,
    student_code: 'ALU-DEMO'
  });
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, id, url: `${base}/t/${id}` });
});

function cryptoRandomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

// MARCAR USO
app.post('/api/tickets/:id/use', (req, res) => {
  const issueKey = process.env.ISSUE_KEY || process.env.ISSUE_API_KEY;
  const reqKey = req.get('X-Issue-Key') || req.query.key;
  if (!issueKey || reqKey !== issueKey) {
    res.status(401).json({ ok: false, error: 'ISSUE_KEY no configurada o inválida' });
    return;
  }
  const ok = markUsed(req.params.id);
  res.json({ ok, id: req.params.id, used: ok });
});

// --------- VISTA DEL TICKET ----------
app.get('/t/:id', async (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) {
    res.status(404).send('Ticket no encontrado');
    return;
  }

  const TITLE = t.event_title || 'Los Miserables';
  const SUBTITLE = 'Boleto general';
  const funcion = t.function_label || '';
  const usuario = `${t.buyer_name} — ${t.buyer_email}`;
  const codigo = t.student_code || t.buyer_phone || t.payment_id || '—';
  const estado = t.used ? 'Usado' : 'No usado';

  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const ticketUrl = `${base}/t/${htmlesc(t.id)}`;
  const qrPng = await QRCode.toDataURL(ticketUrl, { margin: 1, scale: 6 });

  // === AQUÍ EL MAPE0 CORRECTO (coincide con tus llaves de Render) ===
  const LOGO_LIGHT  = process.env.LOGO_URL_LIGHT || ''; // logo negro (para fondo claro)
  const LOGO_DARK   = process.env.LOGO_URL_DARK  || ''; // logo blanco (para fondo oscuro)
  const COSETTE_LIGHT = process.env.COSETTE_URL_LIGHT || '';
  const COSETTE_DARK  = process.env.COSETTE_URL_DARK  || '';

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlesc(TITLE)} — Ticket</title>
  <style>
    :root{
      --grad-top: #4b0e19;
      --grad-bot: #0f0f12;
      --card-bg: #141418;
      --card-border: #1f1f25;
      --text: #e9e9ea;
      --muted: #b9b9bd;
      --ok: #16a34a;
      --chip-bg: rgba(22, 163, 74, .15);
      --chip-fg: #d1fae5;

      /* Asignamos las URLs tal cual están en Render */
      --logo-light: url('${htmlesc(LOGO_LIGHT)}');  /* negro, para tema claro */
      --logo-dark:  url('${htmlesc(LOGO_DARK)}');   /* blanco, para tema oscuro */
      --cosette-light: url('${htmlesc(COSETTE_LIGHT)}');
      --cosette-dark:  url('${htmlesc(COSETTE_DARK)}');
    }
    /* Elegimos según el tema del dispositivo */
    @media (prefers-color-scheme: dark){
      :root{ --logo: var(--logo-dark); --cosette: var(--cosette-dark); }
    }
    @media (prefers-color-scheme: light){
      :root{ --logo: var(--logo-light); --cosette: var(--cosette-light); }
    }
    /* Fallback */
    :root{ --logo: var(--logo-dark); --cosette: var(--cosette-dark); }

    html,body{ height:100%; margin:0; background:#0b0b0e; color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; }
    .wrap{ min-height:100%; display:flex; align-items:center; justify-content:center; padding:20px;}
    .card{
      width:min(1100px, 96vw);
      background: linear-gradient(180deg, rgba(0,0,0,.0), rgba(0,0,0,.0)) padding-box,
                  linear-gradient(180deg, var(--grad-top), var(--grad-bot)) border-box;
      border:1px solid transparent;
      border-radius:18px;
      position:relative;
      overflow:hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,.45);
      padding-bottom:18px;
    }
    .head{
      display:flex; align-items:center; gap:18px;
      padding:22px 26px 12px;
    }
    .logo{
      width:72px; height:72px; background-image:var(--logo);
      background-size:contain; background-repeat:no-repeat; background-position:center;
      filter: drop-shadow(0 2px 0 rgba(0,0,0,.25));
    }
    .titles{ flex:1; }
    h1{ margin:0; font-size:40px; letter-spacing:.5px; }
    .sub{ color:var(--muted); margin-top:4px; }

    .chip{
      background: var(--chip-bg);
      color: var(--chip-fg);
      border-radius:999px;
      padding:8px 14px;
      font-weight:600;
      display:flex; align-items:center; gap:6px;
      position:absolute; top:18px; right:18px;
      border:1px solid rgba(22,163,74,.35);
    }
    .chip-dot{ width:8px; height:8px; border-radius:999px; background:var(--ok); display:inline-block;}
    .chip-icon{ font-weight:900; }
    .divider{ height:1px; background:rgba(255,255,255,.06); margin:10px 0 0; }

    .content{ position:relative; padding:22px 26px 0; }
    .content::before{
      content:"";
      position:absolute; inset:0;
      background-image: var(--cosette);
      background-repeat:no-repeat;
      background-position:center 20px;
      background-size: min(85%, 860px);
      opacity:.18;
      pointer-events:none;
      filter: none;
    }

    .cols{ display:grid; grid-template-columns:1fr auto; gap:28px; align-items:start; }
    .fields{ position:relative; z-index:1; }
    .row{ margin:12px 0; display:flex; gap:8px; }
    .label{ width:96px; color:var(--muted); font-weight:600; }
    .value{ color:var(--text); }

    .qrbox{
      background:#fff; border-radius:18px; padding:14px;
      box-shadow: 0 10px 28px rgba(0,0,0,.35);
    }
    .qrbox img{
      width: clamp(180px, 32vw, 320px); height:auto; display:block;
    }

    .footer{
      display:flex; justify-content:space-between; align-items:center;
      gap:20px; padding:18px 26px 6px;
      color:var(--muted);
    }
    .btns{ display:flex; gap:12px; }
    .btn{
      padding:10px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.04); color:var(--text); cursor:pointer;
    }
    .btn:hover{ background:rgba(255,255,255,.08); }
    .btn-print{ display:inline-flex; }

    .notes{ display:flex; gap:24px; flex-wrap:wrap; }
    .notes b{ color:#fff; }

    @media (max-width: 820px){
      .head{ padding:18px 18px 8px;}
      .logo{ width:56px; height:56px;}
      h1{ font-size:32px;}
      .content{ padding:18px; }
      .cols{ grid-template-columns:1fr; }
      .qrbox{ justify-self:center; }
      .footer{ flex-direction:column; align-items:flex-start; gap:10px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="head">
        <div class="logo" aria-hidden="true"></div>
        <div class="titles">
          <h1>${htmlesc(TITLE)}</h1>
          <div class="sub">${htmlesc(SUBTITLE)}</div>
        </div>
        <div class="chip" title="Estado del boleto">
          <span class="chip-dot"></span>
          <span>${htmlesc(estado)}</span>
        </div>
      </div>
      <div class="divider"></div>

      <div class="content">
        <div class="cols">
          <div class="fields">
            <div class="row"><div class="label">Función:</div><div class="value">${htmlesc(funcion)}</div></div>
            <div class="row"><div class="label">Usuario:</div><div class="value">${htmlesc(usuario)}</div></div>
            <div class="row"><div class="label">Código:</div><div class="value">${htmlesc(codigo)}</div></div>
            <div class="row"><div class="label">Estado:</div><div class="value">${htmlesc(estado)}</div></div>
            <div class="row"><div class="label">ID:</div><div class="value">${htmlesc(t.id)}</div></div>
          </div>

          <div class="qrbox" aria-label="Código QR del boleto">
            <img src="${qrPng}" alt="QR de validación del boleto" />
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="btns">
          <button class="btn btn-print" onclick="window.print()">Imprimir</button>
        </div>
        <div class="notes">
          <span>Presenta este boleto en la entrada</span>
          <span><b>CLASIFICACIÓN:</b> 12 años en adelante.</span>
          <span>No está permitido introducir alimentos y bebidas a la sala.</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// --------- arranque ----------
const PORT = process.env.PORT || 10000;
const BASE = process.env.BASE_URL || '';
if (BASE) console.log('URL BASE:', BASE);
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
