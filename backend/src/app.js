// backend/src/app.js
import express from "express";
import QRCode from "qrcode";
import crypto from "crypto";
import db, { insertTicket, getTicket, markUsed } from "./db.js";

const app = express();
app.use(express.json());

// ===== Entorno =====
const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ISSUE_KEY = process.env.ISSUE_KEY || "";

// Logos y marca de agua (claro/oscuro)
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || ""; // versión BLANCA (modo oscuro)
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || ""; // versión NEGRA  (modo claro)
const WATERMARK_URL_LIGHT = process.env.WATERMARK_URL_LIGHT || "";
const WATERMARK_URL_DARK  = process.env.WATERMARK_URL_DARK  || "";

console.log("URL BASE:", BASE_URL);

// ===== Utilidades =====
const moneyMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(Number(n) || 0);

const routesList = () => ([
  { methods: "GET",  path: "/health" },
  { methods: "GET",  path: "/__routes" },
  { methods: "POST", path: "/api/tickets/issue" },
  { methods: "POST", path: "/api/dev/issue-demo" },
  { methods: "POST", path: "/api/tickets/:id/use" },
  { methods: "GET",  path: "/t/:id" },
]);

// ===== Vista del ticket =====
function renderTicketHTML(t, qrDataUrl) {
  // Campos esperados tal como los tenías
  const title    = t.event_title    || "Los Miserables";
  const funcion  = t.function_label || "";
  const comprador= `${t.buyer_name || ""} — ${t.buyer_email || ""}`;
  const estado   = t.used ? "Usado" : "No usado";
  const price    = moneyMXN(t.price);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
  /* ===== Paleta: vuelve el degradado vino de tu 2ª captura ===== */
  :root{
    --vino-top:#1d0e16;   /* banda superior más oscura */
    --vino-main-a:#2a0f1e;
    --vino-main-b:#3a1528;
    --fg:#eaeaea;
    --muted:#a9a9a9;
    --ok:#2e7d32;
    --warn:#f57c00;
  }
  @media (prefers-color-scheme: light){
    :root{
      --fg:#111;
      --muted:#545454;
      --vino-top:#f3e9ee;
      --vino-main-a:#f2e7ec;
      --vino-main-b:#ead6dd;
    }
    body{ background:#f5f5f7; }
  }

  /* Lienzo */
  body{
    margin:0; padding:28px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif;
    color:var(--fg);
    background:#0c0c10;
    display:flex; justify-content:center;
  }

  /* Tarjeta horizontal con header vino más oscuro y cuerpo vino */
  .card{
    position:relative;
    width:min(1100px, 96vw);
    border-radius:18px;
    overflow:hidden;
    box-shadow:0 22px 60px rgba(0,0,0,.35);
    background: linear-gradient(180deg,var(--vino-top) 0 96px, transparent 96px),
                linear-gradient(135deg,var(--vino-main-a),var(--vino-main-b));
  }

  /* Marca de agua: sin blur, completa, a la derecha, opaca sutil */
  .card::after{
    content:'';
    position:absolute; inset:0; pointer-events:none;
    background-repeat:no-repeat;
    background-position: right 40px center; /* a la derecha, un poco separada del borde */
    background-size: contain;               /* se ve COMPLETA */
    opacity:.14;                            /* sutil sin volverse borrosa */
    ${WATERMARK_URL_LIGHT || WATERMARK_URL_DARK ? "" : "display:none;"}
  }
  @media (prefers-color-scheme: dark){
    .card::after{ background-image:url('${WATERMARK_URL_DARK}'); }
  }
  @media (prefers-color-scheme: light){
    .card::after{ background-image:url('${WATERMARK_URL_LIGHT}'); }
  }

  /* Layout interno */
  .inner{
    position:relative; z-index:1;
    display:grid;
    grid-template-columns: 1fr 360px; /* texto | QR */
    gap:28px;
    padding:24px 28px 22px;
  }

  /* Encabezado en la banda superior */
  .head{
    position:relative; z-index:1;
    display:flex; align-items:flex-end; justify-content:space-between;
    padding:22px 28px 12px;
  }
  .branding{ display:flex; align-items:center; gap:14px; }
  /* Logo blanco sobre fondo oscuro (default), negro en claro */
  .logo{ height:70px; width:auto; display:block; }
  @media (min-width: 900px){ .logo{ height:86px; } }
  .title{ font-size:2rem; font-weight:800; letter-spacing:.2px; margin-bottom:2px; }
  .subtitle{ font-size:.95rem; color:var(--muted); }

  .pill{
    padding:6px 12px; border-radius:999px; font-weight:700; font-size:.95rem;
    color:#fff; display:inline-flex; align-items:center; gap:8px;
    background: var(--ok);
  }
  .pill.warn{ background:var(--warn); }

  .label{ font-weight:700; margin-right:6px; }
  .muted{ color:var(--muted); }

  /* QR a la derecha con borde blanco y sombra */
  .qr{ display:flex; align-items:center; justify-content:center; }
  .qr img{
    width:280px; height:280px;
    background:#fff; padding:10px; border-radius:12px;
    box-shadow:0 8px 18px rgba(0,0,0,.28);
  }

  .fields{ display:flex; flex-direction:column; gap:14px; }
  .id-line{ color:var(--muted); margin-top:10px; }

  .foot{
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 28px 22px; color:var(--muted); font-size:.95rem;
  }

  /* Responsive: apilar en móviles */
  @media (max-width: 820px){
    .inner{ grid-template-columns: 1fr; }
    .qr{ justify-content:flex-start; }
    .qr img{ width:220px; height:220px; }
  }

  /* Usa la versión de logo correcta según esquema */
  @media (prefers-color-scheme: dark){
    .logo { content: url('${LOGO_URL_LIGHT}'); } /* BLANCO */
  }
  @media (prefers-color-scheme: light){
    .logo { content: url('${LOGO_URL_DARK}'); }  /* NEGRO */
  }
</style>
</head>
<body>
  <article class="card">
    <header class="head">
      <div class="branding">
        <picture>
          <source srcset="${LOGO_URL_DARK}" media="(prefers-color-scheme: light)">
          <img class="logo" src="${LOGO_URL_LIGHT}" alt="logo">
        </picture>
        <div>
          <div class="title">${title}</div>
          <div class="subtitle">Boleto digital</div>
        </div>
      </div>
      <div class="pill ${t.used ? "" : "warn"}">${t.used ? "✓ Usado" : "• No usado"}</div>
    </header>

    <section class="inner">
      <div class="fields">
        <div><span class="label">Función:</span> ${funcion || "<span class='muted'>—</span>"}</div>
        <div><span class="label">Comprador:</span> ${comprador}</div>
        <div><span class="label">Precio:</span> ${price}</div>
        <div><span class="label">Estado:</span> ${estado}</div>
        <div class="id-line"><span class="label">ID:</span> ${t.id}</div>
      </div>

      <aside class="qr">
        <img src="${qrDataUrl}" alt="QR" />
      </aside>
    </section>

    <footer class="foot">
      <div>Presenta este boleto en la entrada</div>
      <div></div>
    </footer>
  </article>
</body>
</html>`;
}

// ===== API =====
app.get("/health", (req, res) => {
  res.json({ ok: true, db: !!db, now: new Date().toISOString() });
});
app.get("/__routes", (req, res) => res.json(routesList()));

// Emisión (mantiene tu contrato de campos)
app.post("/api/tickets/issue", (req, res) => {
  try {
    if (!ISSUE_KEY || req.get("X-Issue-Key") !== ISSUE_KEY) {
      return res.status(401).json({ ok:false, error:"ISSUE_KEY inválida" });
    }
    const id = insertTicket({ ...req.body }); // tu insert conserva campos
    res.json({ ok:true, id, url:`${BASE_URL}/t/${id}` });
  } catch (e) {
    console.error("issue error:", e);
    res.status(500).json({ ok:false, error:String(e.message||e) });
  }
});

// Demo opcional
app.post("/api/dev/issue-demo", (req, res) => {
  try {
    if (!ISSUE_KEY || req.get("X-Issue-Key") !== ISSUE_KEY) {
      return res.status(401).json({ ok:false, error:"ISSUE_KEY inválida" });
    }
    const id = insertTicket({
      id: crypto.randomUUID?.(),
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

// Marcar como usado
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

// ===== Arranque =====
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${BASE_URL}`);
});

export default app;
