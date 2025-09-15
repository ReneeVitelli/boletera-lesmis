// backend/src/app.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";

// BD
import { initSchema, getDB } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ---------- utilidades de entorno (logos / cosette) ----------
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || "";
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || "";
const COSETTE_URL_LIGHT = process.env.COSETTE_URL_LIGHT || "";
const COSETTE_URL_DARK  = process.env.COSETTE_URL_DARK  || "";

// ---------- salud ----------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    db: true,
    mail: !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
    now: new Date().toISOString(),
  });
});

// ---------- helper: carga ticket sin romper si faltan columnas ----------
function loadTicketById(db, id) {
  // Leemos *todas* las columnas disponibles; evitamos nombrar columnas
  // que podrían no existir para no romper con SQLITE_ERROR.
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!row) return null;

  // Normalizamos datos esperados por la UI
  const showTitle =
    row.show_title ??
    row.showTitle ??
    row.title ??
    "Los Miserables";

  const showWhen =
    row.show_when ??
    row.showWhen ??
    row.funcion ??
    row.function_when ??
    row.when ??
    ""; // si no hay, queda vacío

  const buyerName =
    row.buyer_name ??
    row.comprador ??
    row.usuario ??
    "—";

  const buyerEmail =
    row.buyer_email ??
    row.email ??
    row.correo ??
    "";

  // status compatible: preferimos 'status'; si no, usamos 'estado'
  const status =
    row.status ??
    row.estado ??
    "VIGENTE";

  // código del alumno con múltiples fuentes de respaldo
  const studentCode =
    row.student_code ??
    row.alumno_code ??
    row.codigo ??
    row.buyer_phone ??
    row.phone ??
    ""; // puede quedar vacío si no hay

  // contenido del QR: si ya lo tienes guardado en alguna col, úsalo,
  // de lo contrario generaremos a partir del link del ticket.
  const qrPayload =
    row.qr ??
    row.qr_url ??
    null;

  return {
    id: String(row.id),
    showTitle,
    showWhen,
    buyerName,
    buyerEmail,
    studentCode,
    status,
    qrPayload,
  };
}

// ---------- página del ticket ----------
app.get("/t/:id", async (req, res) => {
  try {
    const db = getDB();
    const id = req.params.id;

    const t = loadTicketById(db, id);
    if (!t) {
      return res.status(404).send("Ticket no encontrado");
    }

    // Estado: “chip” verde (VIGENTE) o rojo (USADO) arriba a la derecha
    const chipLabel = t.status?.toUpperCase() === "USADO" ? "Usado" : "Vigente";
    const chipClass  = t.status?.toUpperCase() === "USADO" ? "chip-used" : "chip-valid";

    // URL del propio ticket (para QR por defecto)
    const selfURL = `${process.env.BASE_URL || ""}/t/${encodeURIComponent(id)}`;

    // Generamos QR (si no venía de BD)
    const qrText = t.qrPayload || selfURL;
    const qrDataURL = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6, // queda más “discreto” con el marco que ya tienes
    });

    // Render minimal via HTML (manteniendo tu diseño consolidado)
    res.type("html").send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.showTitle} — Boleto</title>
<style>
  :root{
    --card-radius: 14px;
    --bg1:#0f0f12;
    --grad1:#3d0f15;
    --grad2:#130a0e;
    --text:#ececec;
    --muted:#cfcfd2;
    --chip-green:#1f8f3a;
    --chip-red:#a33a3a;
  }
  body{
    margin:0;
    background: var(--bg1);
    color:var(--text);
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji';
  }
  .wrap{
    max-width: 1180px;
    padding: 24px;
    margin: 0 auto;
  }
  .ticket{
    background: linear-gradient(180deg, var(--grad1) 0%, var(--grad2) 100%);
    border-radius: var(--card-radius);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.06) inset, 0 10px 28px rgba(0,0,0,0.5);
    overflow: hidden;
    position: relative;
  }
  .head{
    display:flex;
    align-items:center;
    gap:18px;
    padding: 28px 32px 18px;
    position: relative;
  }
  .brand{
    display:flex; align-items:center; gap:18px;
  }
  .logo{
    height: 120px; width:120px; border-radius: 50%;
    background: center/contain no-repeat url("${LOGO_URL_DARK}");
    filter: drop-shadow(0 2px 4px rgba(0,0,0,.4));
    flex: 0 0 auto;
  }
  .titles h1{ margin:0; font-size: clamp(28px, 4.6vw, 52px); line-height:1; }
  .titles .subtitle{ margin-top:6px; color: var(--muted); }

  .chip{
    position: absolute; right: 28px; top: 20px;
    padding: 8px 14px; border-radius: 999px;
    font-weight: 600; font-size: 14px;
    color: #fff;
    display:flex; align-items:center; gap:8px;
  }
  .chip::before{ content:""; width:8px; height:8px; border-radius:50%; background:#fff; opacity:.85; }
  .chip-valid{ background: var(--chip-green); }
  .chip-used{  background: var(--chip-red); }

  .divider{ height:1px; background: rgba(255,255,255,.12); margin: 8px 0 0; }

  .body{
    display:grid; grid-template-columns: 1fr auto; gap: 28px;
    padding: 24px 32px 28px;
    position: relative;
    min-height: 380px;
  }

  /* Cosette centrada y visible detrás del contenido */
  .cosette{
    position: absolute;
    inset: 0;
    background-position: center 30%;
    background-repeat: no-repeat;
    background-size: min(82vh, 760px);
    opacity: .18;           /* atenuada, sin blur */
    pointer-events: none;
    filter: grayscale(100%); /* sutil */
  }
  @media (prefers-color-scheme: light){
    .logo{ background-image: url("${LOGO_URL_LIGHT}"); }
    .cosette{ background-image: url("${COSETTE_URL_LIGHT}"); opacity:.22; }
  }
  @media (prefers-color-scheme: dark){
    .logo{ background-image: url("${LOGO_URL_DARK}"); }
    .cosette{ background-image: url("${COSETTE_URL_DARK}"); opacity:.22; }
  }

  .fields{
    z-index: 1;
  }
  .row{ margin: 12px 0; }
  .label{ color: var(--muted); font-weight:700; }
  .value{ margin-top:4px; font-size: 18px; }

  .qr{
    z-index:1;
    align-self:center; justify-self:end;
    background:#fff; border-radius:14px; padding:16px;
    box-shadow: 0 10px 24px rgba(0,0,0,.45);
  }
  .qr img{ display:block; width: 320px; height: 320px; } /* ~70% de lo que tenías */
  @media (max-width: 860px){
    .body{ grid-template-columns: 1fr; }
    .qr{ justify-self:center; }
    .qr img{ width: 280px; height: 280px; }
  }

  .footer{
    display:flex; gap:24px; justify-content:space-between; align-items:center;
    padding: 0 32px 22px;
    color: var(--muted);
  }
  .footer b{ color: #fff; }
  .print{ background: transparent; border:1px solid rgba(255,255,255,.3); color:#fff; padding:10px 16px; border-radius:10px; cursor:pointer; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="ticket">
      <div class="head">
        <div class="brand">
          <div class="logo" title="Logo"></div>
          <div class="titles">
            <h1>${t.showTitle}</h1>
            <div class="subtitle">Boleto General</div>
          </div>
        </div>
        <div class="chip ${chipClass}">${chipLabel}</div>
      </div>
      <div class="divider"></div>

      <div class="body">
        <div class="cosette"></div>
        <div class="fields">
          <div class="row">
            <div class="label">Función:</div>
            <div class="value">${t.showWhen || "—"}</div>
          </div>
          <div class="row">
            <div class="label">Usuario:</div>
            <div class="value">${t.buyerName} — ${t.buyerEmail}</div>
          </div>
          <div class="row">
            <div class="label">Código:</div>
            <div class="value">${t.studentCode || "—"}</div>
          </div>
          <div class="row">
            <div class="label">ID:</div>
            <div class="value">${t.id}</div>
          </div>
        </div>

        <div class="qr">
          <img alt="QR" src="${qrDataURL}">
        </div>
      </div>

      <div class="footer">
        <button class="print" onclick="window.print()">Imprimir</button>
        <div>Presenta este boleto en la entrada</div>
        <div><b>CLASIFICACIÓN:</b> 12 años en adelante.</div>
        <div>No está permitido introducir alimentos y bebidas a la sala.</div>
      </div>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error interno");
  }
});

// ---------- arranque ----------
const PORT = process.env.PORT || 10000;
await initSchema();
const db = getDB();
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`BASE URL: ${process.env.BASE_URL || ""}`);
});
