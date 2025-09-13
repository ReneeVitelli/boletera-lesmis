// backend/src/app.js
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import { insertTicket, getTicket, markUsed } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- Mail ---
let mailer = null;
if (process.env.MAIL_SMTP_HOST && process.env.MAIL_USER && process.env.MAIL_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port: Number(process.env.MAIL_SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  console.log('[ correo ] transporte SMTP activo@%s : %s', process.env.MAIL_SMTP_HOST, process.env.MAIL_SMTP_PORT || 465);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;
console.log('URL BASE:', BASE_URL);

// --- util: status pill ---
function statusPill(used) {
  const text = used ? 'Usado' : 'No usado';
  const color = used ? '#1a7f37' : '#7a5d00';
  return `
    <span class="pill" style="--pill:${color}">
      ${used ? '✓' : '•'} ${text}
    </span>`;
}

// --- HTML del ticket ---
function ticketHtml(t, qrDataUrl) {
  // LOGOS (oscuro / claro)
  const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || '';
  const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || '';

  // Código (PRIORIDAD: student_code)
  const codigo = t.student_code || '—';

  const title = t.event_title || 'Los Miserables';
  const legend = 'Boleto general';

  // accesibles
  const funcion  = t.function_label || '';
  const usuario  = `${t.buyer_name || ''} — ${t.buyer_email || ''}`.trim();

  return /* html */`
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Boleto</title>
<style>
:root{
  --bg: #0e0f11;
  --panel: #15171b;
  --card: #1e2127;
  --text: #e7ebf1;
  --sub: #cbd3df;
  --muted: #9aa3af;
  --maroon: #3a0a15;
  --wine: #611828;
}

/* layout base */
html,body{background:#0b0c0f;color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Arial,sans-serif;margin:0}
.wrapper{max-width:1120px;margin:18px auto;padding:0 16px}
.ticket{
  background: linear-gradient(180deg, rgba(97,24,40,.55) 0%, rgba(20,22,26,0) 135px) , var(--panel);
  border:1px solid rgba(255,255,255,.07);
  border-radius:18px; overflow:hidden; position:relative;
  box-shadow:0 8px 30px rgba(0,0,0,.35);
}
.header{
  display:flex; align-items:center; gap:16px; padding:22px 26px 18px 26px;
  background: linear-gradient(180deg, rgba(133,25,45,.7) 0%, rgba(25,27,31,0) 100%);
  border-bottom:1px solid rgba(255,255,255,.06);
}
.logo{width:70px;height:70px;flex:0 0 70px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.06)}
.logo img{max-width:58px;max-height:58px;display:block}
.title{flex:1}
.title h1{font-size:38px;line-height:1.05;margin:0 0 4px 0;letter-spacing:.2px}
.title .legend{color:var(--sub);opacity:.9;font-weight:500}
.pill{display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);padding:8px 12px;border-radius:999px;font-weight:600}
.pill::before{content:"";display:inline-block;width:.001px}
.pill{background:color-mix(in srgb,var(--pill) 18%, transparent);}

.body{display:grid;grid-template-columns:1fr minmax(280px,380px);gap:26px;padding:22px 26px 26px}
.meta .row{display:grid;grid-template-columns:150px 1fr;gap:12px;margin:14px 0}
.key{color:var(--muted);font-weight:600}
.val{color:var(--text)}
.id{color:#aeb7c4}

/* QR card */
.qrCard{background:#fff;border-radius:16px;box-shadow: 0 12px 40px rgba(0,0,0,.45); padding:16px;display:flex;align-items:center;justify-content:center}
.qrCard img{display:block;width:100%;height:auto}

/* watermark Cosette */
.watermark{
  position:absolute; inset:0; pointer-events:none; overflow:hidden;
  mask-image: linear-gradient(180deg, rgba(0,0,0,.12), rgba(0,0,0,.9) 48%, rgba(0,0,0,1) 84%);
}
.watermark::after{
  content:""; position:absolute; left:50%; top:52%;
  width:1000px; height:1000px; transform:translate(-50%,-50%);
  background-image: var(--cosette);
  background-repeat:no-repeat; background-size:contain; background-position:center;
  opacity:.22; filter:grayscale(100%) contrast(.9);
}

/* acciones */
.actions{display:flex;gap:12px;margin-top:14px}
.btn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:var(--text);padding:10px 14px;border-radius:10px;font-weight:600}
.btn:disabled{opacity:.55}

/* status móvil (debajo del QR) */
.statusMobile{display:none;margin-top:14px;justify-content:center}
.statusMobile .pill{padding:12px 18px; font-size:18px}

/* responsive */
@media (max-width: 860px){
  .body{grid-template-columns:1fr}
  .qrCard{max-width:520px;margin:0 auto}
  .statusMobile{display:flex}
}

/* tema claro (si el navegador lo obliga) */
@media (prefers-color-scheme: light){
  html,body{background:#f5f6f8;color:#0e1116}
  .ticket{border-color:rgba(0,0,0,.08)}
  .header{border-bottom-color:rgba(0,0,0,.08)}
  .logo{background:rgba(0,0,0,.06)}
  .qrCard{box-shadow:0 12px 30px rgba(0,0,0,.18)}
}

/* logo adaptativo */
@media (prefers-color-scheme: dark){
  .logo img.light{display:block}
  .logo img.dark{display:none}
}
@media (prefers-color-scheme: light){
  .logo img.light{display:none}
  .logo img.dark{display:block}
}
</style>
</head>
<body>
  <div class="wrapper">
    <div class="ticket">
      <div class="watermark"></div>

      <div class="header">
        <div class="logo">
          ${LOGO_URL_DARK ? `<img class="light" src="${LOGO_URL_DARK}" alt="logo">` : ''}
          ${LOGO_URL_LIGHT ? `<img class="dark"  src="${LOGO_URL_LIGHT}" alt="logo">` : ''}
        </div>
        <div class="title">
          <h1>${title}</h1>
          <div class="legend">${legend}</div>
        </div>
        <div class="statusDesktop">${statusPill(!!t.used)}</div>
      </div>

      <div class="body">
        <div class="meta">
          <div class="row"><div class="key">Función:</div><div class="val">${funcion}</div></div>
          <div class="row"><div class="key">Usuario:</div><div class="val">${usuario}</div></div>
          <div class="row"><div class="key">Código:</div><div class="val">${codigo}</div></div>
          <div class="row"><div class="key">Estado:</div><div class="val">${t.used ? 'Usado' : 'No usado'}</div></div>
          <div class="row"><div class="key">ID:</div><div class="val id">${t.id}</div></div>
          <div class="actions">
            <button class="btn" id="btnPrint">Imprimir</button>
            <button class="btn" id="btnCopy">Copiar enlace</button>
            <button class="btn" id="btnUse" ${t.used ? 'disabled' : ''}>${t.used ? 'Usado' : 'Marcar como usado'}</button>
          </div>
        </div>

        <div>
          <div class="qrCard"><img src="${qrDataUrl}" alt="QR"></div>
          <div class="statusMobile">${statusPill(!!t.used)}</div>
        </div>
      </div>

      <div style="padding:0 26px 22px 26px;color:var(--muted);">
        <div style="opacity:.9;margin-bottom:6px;">Presenta este boleto en la entrada</div>
        <div style="opacity:.9">CLASIFICACIÓN: 12 años en adelante.</div>
        <div style="opacity:.9">No está permitido introducir alimentos y bebidas a la sala.</div>
      </div>
    </div>
  </div>

<script>
document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
document.getElementById('btnCopy')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); alert('Enlace copiado'); }
  catch { alert('No se pudo copiar'); }
});
document.getElementById('btnUse')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try{
    const r = await fetch('/api/tickets/${t.id}/use', {method:'POST'});
    const j = await r.json();
    if (j?.ok) location.reload();
    else { alert('No se pudo marcar'); btn.disabled = false; }
  }catch(_){ alert('No se pudo marcar'); btn.disabled = false; }
});
</script>

<style>
/* Imagen de Cosette centrada (usa una versión “oscura” adecuada al fondo) */
.ticket .watermark::after{
  /* Pon aquí tu URL de Cosette (oscura en tema oscuro / clara si usas tema claro) */
  --cosette-url: url('https://i.postimg.cc/8k0xwJ9b/Cosette-Negra.png');
  background-image: var(--cosette-url);
}
</style>

</body>
</html>`;
}

// --- helpers ---
async function qrFor(url) {
  return await QRCode.toDataURL(url, { margin: 1, scale: 8, errorCorrectionLevel: 'M' });
}

// --- routes ---
app.get('/health', (req, res) => {
  res.json({ ok: true, db: true, mail: !!mailer, now: new Date().toISOString() });
});

app.get('/__routes', (_req, res) => {
  res.json([
    { methods: 'GET',  path: '/health' },
    { methods: 'GET',  path: '/__routes' },
    { methods: 'POST', path: '/api/tickets/issue' },
    { methods: 'POST', path: '/api/dev/issue-demo' },
    { methods: 'POST', path: '/api/tickets/:id/use' },
    { methods: 'GET',  path: '/t/:id' },
  ]);
});

// Emitir (con ISSUE_KEY)
app.post('/api/tickets/issue', async (req, res) => {
  try {
    const key = req.headers['x-issue-key'];
    if (!process.env.ISSUE_KEY) return res.status(500).json({ ok: false, error: 'ISSUE_KEY no configurada en servidor' });
    if (key !== process.env.ISSUE_KEY) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const body = req.body || {};
    const id = cryptoRandomId();

    // admite student_code
    const newId = insertTicket({
      id,
      buyer_name: body.buyer_name,
      buyer_email: body.buyer_email,
      buyer_phone: body.buyer_phone || '',
      function_id: body.function_id,
      function_label: body.function_label,
      event_title: body.event_title || 'Los Miserables',
      currency: body.currency || 'MXN',
      price: Number(body.price || 0),
      payment_id: body.payment_id || null,
      student_code: body.student_code || null,
    });

    const url = `${BASE_URL}/t/${newId}`;

    // correo al comprador
    if (mailer && body.buyer_email) {
      await mailer.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to: body.buyer_email,
        cc: process.env.MAIL_ADMIN || undefined,
        subject: `Tus boletos: ${body.event_title || 'Los Miserables'} — ${body.function_label || ''}`,
        html: `<p><strong>${body.event_title || 'Los Miserables'}</strong></p>
               <p>Función: ${body.function_label || ''}</p>
               <p>Comprador: ${body.buyer_name || ''} — ${body.buyer_email || ''}</p>
               <p><a href="${url}">Abrir mi boleto</a></p>`,
      });
    }

    res.json({ ok: true, id: newId, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Emisión demo (sin body)
app.post('/api/dev/issue-demo', async (_req, res) => {
  try {
    if (!process.env.ISSUE_KEY) return res.status(500).json({ ok: false, error: 'ISSUE_KEY no configurada en servidor' });
    const id = cryptoRandomId();
    const newId = insertTicket({
      id,
      buyer_name: 'Demo',
      buyer_email: 'demo@example.com',
      function_id: 'demo',
      function_label: 'Función Demo — Hoy 20:00',
      event_title: 'Los Miserables',
      price: 1,
      student_code: 'ALU-000',
    });
    const url = `${BASE_URL}/t/${newId}`;
    res.json({ ok: true, id: newId, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Marcar como usado
app.post('/api/tickets/:id/use', (req, res) => {
  const ok = markUsed(req.params.id);
  res.json({ ok, id: req.params.id });
});

// Ver ticket
app.get('/t/:id', async (req, res) => {
  const t = getTicket(req.params.id);
  if (!t) return res.status(404).send('Ticket no encontrado');

  const url = `${BASE_URL}/t/${t.id}`;
  const qr = await qrFor(url);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(ticketHtml(t, qr));
});

// raíz -> 404 (solo API)
app.get('/', (_req, res) => res.status(404).send('API'));

function cryptoRandomId() {
  // uuid v4 simple sin dependencias
  const bytes = cryptoRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
  return `${h.substr(0,8)}-${h.substr(8,4)}-${h.substr(12,4)}-${h.substr(16,4)}-${h.substr(20)}`;
}
function cryptoRandomBytes(n){
  const a = new Uint8Array(n);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a);
  return a;
}

app.listen(PORT, () => {
  console.log('Servidor escuchando en http://localhost:%s ', PORT);
});
