// backend/src/app.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import QRCode from "qrcode";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Variables de entorno
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ISSUE_KEY = process.env.ISSUE_KEY;
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || "";
const LOGO_URL_DARK = process.env.LOGO_URL_DARK || "";
const WATERMARK_URL_LIGHT = process.env.WATERMARK_URL_LIGHT || "";
const WATERMARK_URL_DARK = process.env.WATERMARK_URL_DARK || "";

// Página de salud
app.get("/health", (req, res) => {
  res.json({ ok: true, db: !!db, now: new Date().toISOString(), mail: true });
});

// Emisión de boletos
app.post("/api/tickets/issue", async (req, res) => {
  const key = req.header("X-Issue-Key");
  if (!ISSUE_KEY || key !== ISSUE_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  const { name, email, price, show } = req.body;
  const id = crypto.randomUUID();

  await db.exec("INSERT INTO tickets (id,name,email,price,show) VALUES (?,?,?,?,?)", [
    id, name, email, price, show
  ]);

  res.json({ ok: true, id, url: `${BASE_URL}/t/${id}` });
});

// Marcar como usado
app.post("/api/tickets/:id/use", async (req, res) => {
  const { id } = req.params;
  await db.exec("UPDATE tickets SET used = 1 WHERE id = ?", [id]);
  res.json({ ok: true, id, used: true });
});

// Render de ticket
app.get("/t/:id", async (req, res) => {
  const { id } = req.params;
  const rows = await db.query("SELECT * FROM tickets WHERE id = ?", [id]);
  if (!rows || rows.length === 0) {
    return res.status(404).send("Ticket no encontrado");
  }
  const ticket = rows[0];

  const qrData = `${BASE_URL}/t/${ticket.id}`;
  const qrImage = await QRCode.toDataURL(qrData);

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Boleto ${ticket.show}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: var(--bg);
      color: var(--fg);
      display: flex;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      position: relative;
      background: var(--card-bg);
      padding: 2rem;
      border-radius: 1rem;
      width: 720px;
      box-shadow: 0 0 30px rgba(0,0,0,.25);
      overflow: hidden;
    }
    h1 {
      margin: 0;
      font-size: 1.8rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .logo {
      height: 80px;
    }
    @media (min-width: 900px) {
      .logo {
        height: 100px;
      }
    }
    .status {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: .4rem .8rem;
      border-radius: 999px;
      font-size: .9rem;
      font-weight: bold;
    }
    .status.used {
      background: #2e7d32;
      color: #fff;
    }
    .status.unused {
      background: #f57c00;
      color: #fff;
    }
    .field {
      margin: .6rem 0;
      font-size: 1rem;
    }
    .label {
      font-weight: bold;
    }
    .actions {
      margin-top: 1.5rem;
      display: flex;
      gap: .8rem;
    }
    .btn {
      padding: .5rem 1rem;
      border-radius: .5rem;
      border: none;
      cursor: pointer;
      font-size: .95rem;
    }
    .btn.use { background: #000; color: #fff; }
    .btn.disabled { background: #555; color: #ccc; cursor: not-allowed; }
    .btn.copy { background: #1976d2; color: #fff; }
    .btn.print { background: #555; color: #fff; }

    /* QR Code */
    .qrcode {
      margin-top: 1.2rem;
      text-align: right;
    }
    .qrcode img {
      width: 180px;
      height: 180px;
      padding: 6px;
      background: #fff;        /* borde blanco */
      border-radius: .5rem;
      box-shadow: 0 2px 6px rgba(0,0,0,.3);
    }

    /* Marca de agua Cosette */
    .card::after {
      content: ''; 
      position: absolute; 
      inset: 0; 
      pointer-events: none; 
      opacity: 0.06;
      filter: blur(2px);
      background-repeat: no-repeat; 
      background-position: center center;
      background-size: 420px auto;
      ${WATERMARK_URL_LIGHT || WATERMARK_URL_DARK ? '' : 'display:none;'}
    }

    @media (prefers-color-scheme: dark) {
      body { --bg: #111; --fg: #eee; --card-bg: #1e1e1e; }
      .card::after { background-image: url('${WATERMARK_URL_DARK}'); }
      .logo { content: url('${LOGO_URL_LIGHT}'); }
    }
    @media (prefers-color-scheme: light) {
      body { --bg: #f5f5f5; --fg: #111; --card-bg: #fff; }
      .card::after { background-image: url('${WATERMARK_URL_LIGHT}'); }
      .logo { content: url('${LOGO_URL_DARK}'); }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>
      ${LOGO_URL_LIGHT || LOGO_URL_DARK ? `<img src="${LOGO_URL_LIGHT}" class="logo" alt="logo">` : ""}
      Los Miserables
    </h1>
    <div class="status ${ticket.used ? "used" : "unused"}">
      ${ticket.used ? "✔ Usado" : "• No usado"}
    </div>
    <div class="field"><span class="label">Función:</span> ${ticket.show}</div>
    <div class="field"><span class="label">Comprador:</span> ${ticket.name} — ${ticket.email}</div>
    <div class="field"><span class="label">Precio:</span> ${ticket.price} MXN</div>
    <div class="field"><span class="label">Estado:</span> ${ticket.used ? "Usado" : "No usado"}</div>
    <div class="field"><span class="label">ID:</span> ${ticket.id}</div>
    <div class="qrcode">
      <img src="${qrImage}" alt="QR">
    </div>
    <div class="actions">
      ${ticket.used
        ? `<button class="btn disabled">Usado</button>`
        : `<form method="POST" action="/api/tickets/${ticket.id}/use">
             <button class="btn use">Marcar como usado</button>
           </form>`}
      <button class="btn copy" onclick="navigator.clipboard.writeText(window.location.href)">Copiar enlace</button>
      <button class="btn print" onclick="window.print()">Imprimir</button>
    </div>
    <p>Presenta este boleto en la entrada</p>
  </div>
</body>
</html>`);
});

// Servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Servidor escuchando en http://localhost:" + PORT);
  console.log("URL BASE:", BASE_URL);
});

export default app;
