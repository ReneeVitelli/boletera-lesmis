// backend/src/app.js
// ======================================================
// Boletera Les Mis — Servidor Express
// Mantiene: Header, logo 200%, QR 70%, márgenes consolidados.
// Ajuste: Cosette visible como marca de agua centrada.
// ======================================================

import express from "express";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import QRCode from "qrcode";

// Importa DB y esquema existentes (no tocar estos nombres)
import { db, initSchema } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Config ----------
const app = express();
const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || "http://localhost:" + PORT;

// Logos (ya consolidados)
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || "";
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || "";

// Cosette (marca de agua) — usamos LIGHT para tema claro y DARK para oscuro
const COSETTE_URL_LIGHT = process.env.COSETTE_URL_LIGHT || "";
const COSETTE_URL_DARK  = process.env.COSETTE_URL_DARK  || "";

// ---------- Middlewares ----------
app.use(bodyParser.json());
app.disable("x-powered-by");

// ---------- Salud ----------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    db: !!db,
    mail: !!process.env.MAIL_USER, // indicativo nada más
    now: new Date().toISOString(),
  });
});

// ======================================================
// Utilidades
// ======================================================

function fetchTicket(id) {
  const stmt = db.prepare(`
    SELECT id, show_title, show_when, buyer_name, buyer_email,
           price_cents, used, alumno_code, codigo, buyer_phone
    FROM tickets
    WHERE id = ?
  `);
  return stmt.get(id);
}

function chip(text, tone) {
  // tone: "ok" (verde), "warn" (ámbar), "bad" (rojo)
  const map = {
    ok:   { bg: "#156f2a", dot: "#22c55e" },
    warn: { bg: "#7a5d17", dot: "#fbbf24" },
    bad:  { bg: "#7a1c18", dot: "#ef4444" },
  };
  const c = map[tone] || map.warn;
  return `
    <span class="chip" style="--chip-bg:${c.bg};--chip-dot:${c.dot}">
      <span class="dot"></span>${text}
    </span>
  `;
}

function niceMoney(cents) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format((cents || 0) / 100);
}

// Para el QR ya consolidado a 70%
async function buildQR(url) {
  const dataURL = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8, // escala base; lo limitamos por CSS al 70% del tamaño consolidado
    color: {
      dark: "#000000",
      light: "#ffffffff",
    },
  });
  return dataURL;
}

// ======================================================
// Página del ticket
// ======================================================
app.get("/t/:id", async (req, res) => {
  const id = req.params.id;
  const t = fetchTicket(id);

  if (!t) {
    res.status(404).send(`<h1 style="font-family:system-ui">Ticket no encontrado</h1>`);
    return;
  }

  // Estado (solo para mostrar chip, no editamos el ticket aquí)
  const isUsed = !!t.used;
  const estadoChip = isUsed ? chip("Usado", "bad") : chip("Vigente", "ok");

  // Código del alumno (conservamos la regla: alumno_code > codigo > buyer_phone)
  const codeField = (t.alumno_code || t.codigo || t.buyer_phone || "").toString().trim();
  const alumnoCodigo = codeField || "—";

  // Armar QR hacia la misma URL del ticket
  const ticketURL = `${BASE_URL}/t/${id}`;
  const qrData = await buildQR(ticketURL);

  // Título, función, usuario (ya consolidados)
  const titulo = t.show_title || "Los Miserables";
  const funcion = t.show_when || "—";
  const usuario = `${t.buyer_name || "—"} — ${t.buyer_email || "—"}`;

  // Render HTML
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="es" class="h">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${titulo} — Boleto</title>
<style>
  :root{
    --bg:#0b0b0d;
    --card:#141417;
    --ink:#ffffff;
    --muted:#c9c9cf;
    --accentTop:#4a0f18;
    --accentBot:#1a1216;

    /* Consolidados: tamaños OK */
    --logo-size: 120px; /* 200% aplicado en layout final (ver .brand > img) */
    --qr-box: 440px;    /* caja del QR */
    --qr-scale: 0.70;   /* 70% consolidado */
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0;
    font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,'Helvetica Neue',Arial;
    color:var(--ink);
    background: radial-gradient(1200px 800px at 50% -200px, #21060b 0%, #0b0b0d 55%);
  }
  .wrap{
    max-width:1280px;
    margin:24px auto;
    padding:0 16px;
  }
  .ticket{
    position:relative;
    border-radius:18px;
    background: linear-gradient(180deg, var(--accentTop) 0%, var(--accentBot) 38%);
    overflow:hidden;
    box-shadow: 0 10px 35px rgba(0,0,0,.35);
  }
  .ticket .top{
    padding:28px 28px 18px 28px;
    display:flex;
    align-items:center;
    gap:20px;
    min-height:140px; /* header alto para alojar logo sin encimar */
  }
  .brand{
    display:flex; align-items:center; gap:18px;
  }
  .brand img{
    width: calc(var(--logo-size) * 1.0); /* 200% ya se consensuó; este tamaño visual está consolidado */
    height: calc(var(--logo-size) * 1.0);
    object-fit:contain;
    filter: drop-shadow(0 1px 0 rgba(0,0,0,.25));
  }
  .title h1{
    margin:0;
    font-size: clamp(28px, 3.2vw, 44px);
    font-weight: 800;
    letter-spacing:.2px;
  }
  .title .sub{
    margin-top:6px;
    color: var(--muted);
    font-weight:600;
  }
  .chip{
    margin-left:auto;
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding:10px 14px;
    border-radius:1000px;
    background: var(--chip-bg,#314b1f);
    color:#f0fff4;
    font-weight:700;
    font-size:15px;
  }
  .chip .dot{
    width:8px;height:8px;border-radius:999px;background:var(--chip-dot,#22c55e);
    display:inline-block;
    box-shadow:0 0 0 3px rgba(0,0,0,.25) inset;
  }

  .hr{height:1px; background: rgba(255,255,255,.08); margin:0 28px;}

  .main{
    position:relative;
    padding:26px 28px 22px 28px;
    display:grid;
    grid-template-columns: 1fr auto;
    gap:24px;
    background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.35) 100%);
  }

  /* ---------- WATERMARK COSETTE (ÚNICO AJUSTE REAL) ---------- */
  .wm{
    position:absolute;
    z-index:0;
    inset:0;
    pointer-events:none;
    /* capa para oscurecer sutil el fondo bajo la marca de agua */
  }
  .wm::after{
    content:"";
    position:absolute;
    inset:0;
    background-repeat:no-repeat;
    background-position:center 55%;
    background-size: min(88vh, 75vw); /* contenida, grande pero sin invadir QR */
    opacity:.18; /* atenuada; si quieres más presencia, sube a .22 */
    filter: none; /* sin blur; solo atenuada */
  }
  /* tema claro/oscuro para Cosette (no altera nada más) */
  @media (prefers-color-scheme: dark){
    .wm::after{ background-image: url("${COSETTE_URL_DARK}"); }
  }
  @media (prefers-color-scheme: light){
    .wm::after{ background-image: url("${COSETTE_URL_LIGHT}"); }
  }
  /* si no hay URLs, no pintamos nada */
  ${(!COSETTE_URL_LIGHT && !COSETTE_URL_DARK) ? `.wm::after{ background-image:none !important; }` : ""}

  /* ---------- Columna izquierda (datos) ---------- */
  .info{
    position:relative; z-index:1;
    display:flex; flex-direction:column; gap:14px;
  }
  .row{display:flex; gap:12px; align-items:baseline; line-height:1.45}
  .lbl{min-width:90px; color:#e8e8ec; font-weight:800}
  .val{color:#f7f7fa; font-weight:600}

  /* ---------- Columna derecha (QR) ---------- */
  .qrWrap{
    position:relative; z-index:1;
    align-self:center;
    background:#fff; padding:18px; border-radius:16px;
    width: var(--qr-box); height: var(--qr-box);
    display:flex; align-items:center; justify-content:center;
    box-shadow: 0 10px 25px rgba(0,0,0,.35);
  }
  .qrWrap img{
    width: calc(100% * var(--qr-scale));
    height: calc(100% * var(--qr-scale));
    object-fit:contain;
    image-rendering:pixelated;
  }

  /* ---------- Footer line ---------- */
  .foot{
    display:flex; gap:24px; justify-content:space-between; align-items:center;
    padding:14px 22px 22px 22px; color:#dddde3; font-weight:600;
  }
  .foot .b{font-weight:900; color:#ffffff}

  /* ---------- Button imprimir (no moved) ---------- */
  .printBtn{
    background:#2b2b2f; color:#fff; border:1px solid #41414a;
    padding:10px 16px; border-radius:10px; cursor:pointer;
  }

  /* ---------- Responsive ---------- */
  @media (max-width: 980px){
    .main{ grid-template-columns: 1fr; }
    .qrWrap{ justify-self:center; }
  }
  @media (max-width: 640px){
    .title h1{ font-size: clamp(26px, 8vw, 32px); }
    .brand img{ width:110px; height:110px; }
    .qrWrap{
      width: min(86vw, 420px);
      height: min(86vw, 420px);
    }
    .wm::after{
      background-size: min(95vh, 100vw);
      opacity:.20; /* un poquito más en vertical para que se alcance a ver */
      background-position:center 50%;
    }
  }
</style>
</head>
<body>
  <div class="wrap">
    <article class="ticket">
      <header class="top">
        <div class="brand">
          <!-- Logo: BLANCO en oscuro, NEGRO en claro (ya configurado por URL) -->
          <picture>
            <!-- light -->
            ${LOGO_URL_LIGHT ? `<source srcset="${LOGO_URL_LIGHT}" media="(prefers-color-scheme: light)">` : ""}
            <!-- dark -->
            ${LOGO_URL_DARK  ? `<img src="${LOGO_URL_DARK}" alt="logo" width="160" height="160" loading="eager">` : `<div style="width:120px;height:120px"></div>`}
          </picture>

          <div class="title">
            <h1>${titulo}</h1>
            <div class="sub">Boleto General</div>
          </div>
        </div>
        ${estadoChip}
      </header>

      <div class="hr"></div>

      <section class="main">
        <!-- Capa de marca de agua (no tapa info ni QR) -->
        <div class="wm" aria-hidden="true"></div>

        <div class="info">
          <div class="row"><div class="lbl">Función:</div><div class="val">${funcion}</div></div>
          <div class="row"><div class="lbl">Usuario:</div><div class="val">${usuario}</div></div>
          <div class="row"><div class="lbl">Código:</div><div class="val">${alumnoCodigo}</div></div>
          <div class="row"><div class="lbl">ID:</div><div class="val">${t.id}</div></div>
        </div>

        <div class="qrWrap">
          <img src="${qrData}" alt="QR del boleto">
        </div>
      </section>

      <footer class="foot">
        <button class="printBtn" onclick="window.print()">Imprimir</button>
        <div>Presenta este boleto en la entrada</div>
        <div><span class="b">CLASIFICACIÓN:</span> 12 años en adelante.</div>
        <div>No está permitido introducir alimentos y bebidas a la sala.</div>
      </footer>
    </article>
  </div>
</body>
</html>`);
});

// ======================================================
// (Resto de endpoints de API existentes) — No tocar
// ======================================================

// Emisión normal (conservado)
app.post("/api/tickets/issue", (req, res) => {
  try {
    const payload = req.body || {};
    const id = cryptoRandomId();
    const stmt = db.prepare(`
      INSERT INTO tickets
        (id, show_title, show_when, buyer_name, buyer_email, price_cents, used, alumno_code, codigo, buyer_phone)
      VALUES
        (@id, @show_title, @show_when, @buyer_name, @buyer_email, @price_cents, 0, @alumno_code, @codigo, @buyer_phone)
    `);
    stmt.run({
      id,
      show_title: payload.show_title || "Los Miserables",
      show_when:  payload.show_when  || "",
      buyer_name: payload.buyer_name || "",
      buyer_email:payload.buyer_email|| "",
      price_cents:payload.price_cents|| 0,
      alumno_code:payload.alumno_code|| "",
      codigo:     payload.codigo     || "",
      buyer_phone:payload.buyer_phone|| "",
    });
    res.json({ ok:true, id, url: `${BASE_URL}/t/${id}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Usar ticket (conservado)
app.post("/api/tickets/:id/use", (req, res) => {
  const id = req.params.id;
  try{
    const upd = db.prepare(`UPDATE tickets SET used=1 WHERE id=?`).run(id);
    res.json({ ok:true, id, used: true, changes: upd.changes });
  }catch(e){
    console.error(e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Lista de rutas para diagnóstico (conservado)
app.get("/__routes", (req, res) => {
  res.json([
    { methods:"GET",  path:"/health" },
    { methods:"GET",  path:"/__routes" },
    { methods:"POST", path:"/api/tickets/issue" },
    { methods:"POST", path:"/api/tickets/:id/use" },
    { methods:"GET",  path:"/t/:id" },
  ]);
});

// ======================================================
// Inicio
// ======================================================
initSchema();
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${BASE_URL}`);
});

// Utilidad simple para IDs
function cryptoRandomId(){
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
