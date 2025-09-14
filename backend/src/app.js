// backend/src/app.js
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';

import db, { insertTicket, getTicket, markUsed } from './db.js';

const app = express();
app.use(bodyParser.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------ util ------------------
function htmlesc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cryptoRandomId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

// ------------------ diagnóstico ------------------
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
    { methods: 'GET', path: '/t/:id' },
  ]);
});

// ------------------ emisión ------------------
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

// demo protegida
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
    buyer_name: 'Prueba Aviso Admin',
    buyer_email: 'anamaria.brito@gmail.com',
    buyer_phone: '',
    function_id: 'funcion-admin',
    function_label: 'Función Admin — Sáb 6 Dic 18:00',
    event_title: 'Los Miserables',
    currency: 'MXN',
    price: 350,
    payment_id: null,
    student_code: 'ALU-12345',
  });
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, id, url: `${base}/t/${id}` });
});

// marcar usado (staff)
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

// ------------------ vista del ticket ------------------
app.get('/t/:id', async (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) { res.status(404).send('Ticket no encontrado'); return; }

  const TITLE = t.event_title || 'Los Miserables';
  const SUBTITLE = 'Boleto General';
  const funcion = t.function_label || '';
  const usuario = `${t.buyer_name} — ${t.buyer_email}`;

  // fallback robusto para “Código”
  const studentCode = [
    t.student_code,
    t.alumno_code,
    t.codigo,
    t.buyer_phone,
    t.payment_id
  ].map(v => (v ?? '') + '').map(s => s.trim()).find(s => s.length > 0) || '';

  const isUsed = !!t.used;
  const chipText = isUsed ? 'Usado' : 'Vigente';
  const chipClass = isUsed ? 'used' : 'ok';

  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const ticketUrl = `${base}/t/${htmlesc(t.id)}`;

  // QR discreto (~70%)
  const qrPng = await QRCode.toDataURL(ticketUrl, { margin: 1, scale: 5 });

  // assets por tema
  const LOGO_LIGHT    = process.env.LOGO_URL_LIGHT    || '';
  const LOGO_DARK     = process.env.LOGO_URL_DARK     || '';
  const COSETTE_LIGHT = process.env.COSETTE_URL_LIGHT || '';
  const COSETTE_DARK  = process.env.COSETTE_URL_DARK  || '';

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlesc(TITLE)} — Ticket</title>
<style>
  :root{
    --grad-top:#4b0e19;
    --grad-bot:#0f0f12;
    --text:#e9e9ea;
    --muted:#b9b9bd;

    --logo-light:url('${htmlesc(LOGO_LIGHT)}');
    --logo-dark:url('${htmlesc(LOGO_DARK)}');
    --cosette-light:url('${htmlesc(COSETTE_LIGHT)}');
    --cosette-dark:url('${htmlesc(COSETTE_DARK)}');
  }
  @media (prefers-color-scheme:dark){
    :root{ --logo:var(--logo-dark); --cosette:var(--cosette-dark); }
  }
  @media (prefers-color-scheme:light){
    :root{ --logo:var(--logo-light); --cosette:var(--cosette-light); }
  }
  :root{ --logo:var(--logo-dark); --cosette:var(--cosette-dark); }

  html,body{height:100%;margin:0;background:#0b0b0e;color:var(--text);
    font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}

  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{
    width:min(1100px,96vw);
    background:linear-gradient(180deg,var(--grad-top),var(--grad-bot));
    border-radius:18px; position:relative; overflow:hidden;
    box-shadow:0 20px 50px rgba(0,0,0,.45);
  }

  /* ===== Header en grid: logo | títulos | chip (sin encimar) ===== */
  .head{
    display:grid;
    grid-template-columns:140px 1fr auto;   /* logo 140px fijo */
    align-items:center;
    column-gap:18px;
    padding:28px 26px 18px;
    min-height:160px;
  }
  .logo{
    width:140px;height:140px;               /* 200% del tamaño original aprox */
    background-image:var(--logo);
    background-size:contain;background-repeat:no-repeat;background-position:left center;
  }
  .titles h1{margin:0;font-size:42px;letter-spacing:.5px;line-height:1.05}
  .titles .sub{color:var(--muted);margin-top:6px}

  .chip{
    justify-self:end;
    border-radius:999px;padding:8px 14px;font-weight:700;display:flex;gap:8px;align-items:center
  }
  .chip.ok  { background:rgba(22,163,74,.18); color:#d1fae5; border:1px solid rgba(22,163,74,.35); }
  .chip.used{ background:rgba(220,38,38,.16); color:#fecaca; border:1px solid rgba(220,38,38,.35); }
  .chip-dot{width:8px;height:8px;border-radius:999px}
  .chip.ok  .chip-dot{background:#16a34a}
  .chip.used .chip-dot{background:#dc2626}

  .divider{height:1px;background:rgba(255,255,255,.06);margin:8px 0 0}

  .content{position:relative;padding:22px 26px 0}
  /* ===== Cosette centrada y visible ===== */
  .content::before{
    content:"";position:absolute;inset:0;pointer-events:none;opacity:.28;
    background-image:var(--cosette);background-repeat:no-repeat;background-position:center;
    background-size:min(92vh,950px);
    z-index:0;
  }

  .cols{display:grid;grid-template-columns:1fr auto;gap:28px;align-items:start;position:relative;z-index:1}
  .fields{position:relative;z-index:1}
  .row{margin:12px 0;display:flex;gap:8px}
  .label{width:110px;font-weight:800}
  .value{color:var(--text)}

  .qrbox{background:#fff;border-radius:12px;padding:10px;box-shadow:0 10px 28px rgba(0,0,0,.35)}
  .qrbox img{width:clamp(140px,20vw,210px);height:auto;display:block}

  /* Chip móvil debajo del QR */
  .chip-mobile{display:none;margin-top:10px;justify-content:center}
  .chip-desktop{display:flex}

  .footer{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 26px 18px;color:var(--muted)}
  .btn{padding:10px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);cursor:pointer}
  .btn:hover{background:rgba(255,255,255,.08)}
  .notes{display:flex;gap:24px;flex-wrap:wrap}
  .notes b{color:#fff;font-weight:800}

  @media (max-width:820px){
    .head{
      grid-template-columns:110px 1fr;     /* ocultamos chip de desktop */
      row-gap:8px;
    }
    .logo{width:110px;height:110px}
    .titles h1{font-size:34px}
    .chip-desktop{display:none}
    .content{padding:18px}
    .cols{grid-template-columns:1fr}
    .qrbox{justify-self:center}
    .chip-mobile{display:flex}
    .footer{flex-direction:column;align-items:flex-start;gap:10px}
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
        <div class="chip chip-desktop ${chipClass}" title="Estado del boleto">
          <span class="chip-dot"></span><span>${htmlesc(chipText)}</span>
        </div>
      </div>
      <div class="divider"></div>

      <div class="content">
        <div class="cols">
          <div class="fields">
            <div class="row"><div class="label">Función:</div><div class="value">${htmlesc(funcion)}</div></div>
            <div class="row"><div class="label">Usuario:</div><div class="value">${htmlesc(usuario)}</div></div>
            ${studentCode ? `<div class="row"><div class="label">Código:</div><div class="value">${htmlesc(studentCode)}</div></div>` : ``}
            <div class="row"><div class="label">ID:</div><div class="value">${htmlesc(t.id)}</div></div>
          </div>

          <div>
            <div class="qrbox" aria-label="Código QR del boleto">
              <img src="${qrPng}" alt="QR de validación del boleto" />
            </div>
            <div class="chip chip-mobile ${chipClass}" title="Estado del boleto">
              <span class="chip-dot"></span><span>${htmlesc(chipText)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <button class="btn" onclick="window.print()">Imprimir</button>
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

// ------------------ arranque ------------------
const PORT = process.env.PORT || 10000;
const BASE = process.env.BASE_URL || '';
if (BASE) console.log('URL BASE:', BASE);
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
