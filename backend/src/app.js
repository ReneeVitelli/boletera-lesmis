// backend/src/app.js
import express from "express";
import QRCode from "qrcode";
import db, { insertTicket, getTicket, markUsed } from "./db.js";

const app = express();
app.use(express.json());

// ====== Entorno ======
const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ISSUE_KEY = process.env.ISSUE_KEY || "";

// Logos y marca de agua (claro/oscuro)
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || "";
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || "";
const WATERMARK_URL_LIGHT = process.env.WATERMARK_URL_LIGHT || "";
const WATERMARK_URL_DARK  = process.env.WATERMARK_URL_DARK  || "";

console.log("URL BASE:", BASE_URL);

// ====== Utilidades ======
function moneyMXN(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(v);
}

function routesList() {
  return [
    { methods: "GET",  path: "/health" },
    { methods: "GET",  path: "/__routes" },
    { methods: "POST", path: "/api/tickets/issue" },
    { methods: "POST", path: "/api/dev/issue-demo" },
    { methods: "POST", path: "/api/tickets/:id/use" },
    { methods: "GET",  path: "/t/:id" },
  ];
}

// ====== Vistas ======
function renderTicketHTML(t, qrDataUrl) {
  // Campos esperados del ticket (como los tenías):
  // id, event_title, function_label, buyer_name, buyer_email, price, used
  const title = t.event_title || "Los Miserables";
  const funcion = t.function_label || "";
  const comprador = `${t.buyer_name || ""} — ${t.buyer_email || ""}`;
  const estado = t.used ? "Usado" : "No usado";
  const price = moneyMXN(t.price);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  :root{
    --vino-a:#2d0f1f;  /* vino oscuro */
    --vino-b:#4a1e30;  /* vino claro */
    --card-bg:linear-gradient(135deg,var(--vino-a),var(--vino-b));
    --fg:#eee;
    --muted:#b9b9b9;
    --ok:#2e7d32;
    --warn:#f57c00;
  }
  @media (prefers-color-scheme: light){
    :root{
      --fg:#111;
      --muted:#555;
      --vino-a:#f2e7ea;
      --vino-b:#ead6dc;
      --card-bg:linear-gradient(135deg,#ffffff,#f7eef2);
    }
    body{ background:#f5f5f7; }
  }
  body{
    margin:0;
    padding:24px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif;
    color:var(--fg);
    background:#0c0c0f;
    display:flex; justify-content:center;
  }
  .card{
    position:relative;
    display:grid;
    grid-template-columns: 1fr 220px;
    gap:24px;
    width:min(980px, 96vw);
    border-radius:16px;
    padding:24px 24px 20px;
    background:var(--card-bg);
    box-shadow:0 18px 48px rgba(0,0,0,.35);
    overflow:hidden;
  }
  /* Marca de agua centrada y suavizada */
  .card::after{
    content:'';
    position:absolute; inset:0; pointer-events:none;
    background-repeat:no-repeat;
    background-position:center center;
    background-size:520px auto;
    opacity:.08;
    filter: blur(2px);
    ${WATERMARK_URL_LIGHT || WATERMARK_URL_DARK ? "" : "display:none;"}
  }
  @media (prefers-color-scheme: dark){
    .card::after{ background-image:url('${WATERMARK_URL_DARK}'); }
  }
  @media (prefers-color-scheme: light){
    .card::after{ background-image:url('${WATERMARK_URL_LIGHT}'); }
  }

  .head{
    position:relative; z-index:1;
    grid-column:1 / -1;
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom:4px;
  }
  .branding{ display:flex; align-items:center; gap:14px; }
  .logo{
    height:64px; width:auto; display:block;
  }
  @media (min-width: 900px){ .logo{ height:84px; } }
  .title{ font-size:1.9rem; font-weight:800; letter-spacing:.2px; }
  .subtitle{ font-size:.95rem; color:var(--muted); margin-top:2px; }

  .pill{
    position:relative; z-index:1;
    padding:6px 12px; border-radius:999px; font-weight:700; font-size:.95rem;
    color:#fff; display:inline-flex; align-items:center; gap:8px;
  }
  .pill.ok{ background:var(--ok); }
  .pill.warn{ background:var(--warn); }

  .info{
    position:relative; z-index:1;
    display:flex; flex-direction:column; gap:12px;
  }
  .row .label{ font-weight:700; margin-right:6px; }
  .muted{ color:var(--muted); }

  .qr{
    position:relative; z-index:1;
    display:flex; align-items:center; justify-content:center;
  }
  .qr img{
    width:200px; height:200px; background:#fff; padding:8px; border-radius:10px;
    box-shadow:0 6px 14px rgba(0,0,0,.30);
  }

  .foot{
    position:relative; z-index:1;
    grid-column:1 / -1;
    display:flex; align-items:center; justify-content:space-between;
    margin-top:16px; color:var(--muted); font-size:.9rem;
  }

  /* Responsive: apilar en móviles */
  @media (max-width: 720px){
    .card{ grid-template-columns: 1fr; }
    .qr{ justify-content:flex-start; }
    .qr img{ width:180px; height:180px; }
  }
</style>
</head>
<body>
  <article class="card">
    <header class="head">
      <div class="branding">
        <picture>
          ${LOGO_URL_LIGHT || LOGO_URL_DARK ? `
            <source srcset="${LOGO_URL_DARK}" media="(prefers-color-scheme: light)">
            <img class="logo" src="${LOGO_URL_LIGHT}" alt="logo">
          ` : ``}
        </picture>
        <div>
          <div class="title">${title}</div>
          <div class="subtitle">Boleto digital</div>
        </div>
      </div>
      <div class="pill ${t.used ? "ok" : "warn"}">${t.used ? "✓ Usado" : "• No usado"}</div>
    </header>

    <section class="info">
      <div class="row"><span class="label">Función:</span> ${funcion || "<span class='muted'>—</span>"}</div>
      <div class="row"><span class="label">Comprador:</span> ${comprador}</div>
      <div class="row"><span class="label">Precio:</span> ${price}</div>
      <div class="row"><span class="label">Estado:</span> ${estado}</div>
      <div class="row muted"><span class="label">ID:</span> ${t.id}</div>
    </section>

    <aside class="qr">
      <img src="${qrDataUrl}" alt="QR" />
    </aside>

    <footer class="foot">
      <div>Presenta este boleto en la entrada</div>
      <div></div>
    </footer>
  </article>
</body>
</html>`;
}

// ====== Endpoints ======
app.get("/health", (req, res) => {
  res.json({ ok: true, db: !!db, now: new Date().toISOString() });
});

app.get("/__routes", (req, res) => {
  res.json(routesList());
});

// Emisión normal (mantiene tu contrato de campos)
app.post("/api/tickets/issue", async (req, res) => {
  try {
    if (!ISSUE_KEY || req.get("X-Issue-Key") !== ISSUE_KEY) {
      return res.status(401).json({ ok:false, error:"ISSUE_KEY inválida" });
    }
    // Pasamos tal cual los campos esperados por tu DB: buyer_name, buyer_email, function_id, function_label, event_title, price, currency, payment_id?
    const id = insertTicket({ ...req.body });
    return res.json({ ok:true, id, url: `${BASE_URL}/t/${id}` });
  } catch (e) {
    console.error("issue error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Demo opcional (si lo usas)
app.post("/api/dev/issue-demo", async (req, res) => {
  try {
    if (!ISSUE_KEY || req.get("X-Issue-Key") !== ISSUE_KEY) {
      return res.status(401).json({ ok:false, error:"ISSUE_KEY inválida" });
    }
    const id = insertTicket({
      id: crypto.randomUUID?.() || undefined,
      buyer_name:"Prueba Aviso Admin",
      buyer_email: process.env.MAIL_ADMIN || "demo@example.com",
      function_id:"demo",
      function_label:"Función Admin — Sáb 6 Dic 18:00",
      event_title:"Los Miserables",
      price:350,
      currency:"MXN",
    });
    res.json({ ok:true, id, url:`${BASE_URL}/t/${id}` });
  } catch (e) {
    console.error("dev demo error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Marcar como usado (idempotente)
app.post("/api/tickets/:id/use", (req, res) => {
  try {
    const changed = markUsed(req.params.id);
    res.json({ ok:true, id:req.params.id, used:true, changed });
  } catch (e) {
    console.error("markUsed error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Ver ticket
app.get("/t/:id", async (req, res) => {
  try {
    const t = getTicket(req.params.id);
    if (!t) return res.status(404).send("No encontrado");

    const qrUrl = `${BASE_URL}/t/${t.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl);

    res.send(renderTicketHTML(t, qrDataUrl));
  } catch (e) {
    console.error("render ticket error:", e);
    res.status(500).send("Error interno");
  }
});

// ====== Arranque ======
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${BASE_URL}`);
});

export default app;
