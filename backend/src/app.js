import express from "express";
import path from "path";
import QRCode from "qrcode";
import { fileURLToPath } from "url";
import { db, initSchema } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

await initSchema();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===================
// RUTA DE BOLETO
// ===================
app.get("/t/:id", async (req, res) => {
  const id = req.params.id;
  const ticket = db
    .prepare("SELECT * FROM tickets WHERE id = ?")
    .get(id);

  if (!ticket) {
    res.status(404).send("Boleto no encontrado");
    return;
  }

  // Generar QR con la URL del ticket
  const qrUrl = `${process.env.BASE_URL}/t/${ticket.id}`;
  const qrData = await QRCode.toDataURL(qrUrl);

  // Logo adaptativo
  const logoLight = process.env.LOGO_URL_LIGHT;
  const logoDark = process.env.LOGO_URL_DARK;

  // Cosette adaptativa
  const cosetteLight = process.env.COSETTE_URL_LIGHT;
  const cosetteDark = process.env.COSETTE_URL_DARK;

  // Estado visual
  const statusLabel = ticket.used ? "Usado" : "Vigente";
  const statusClass = ticket.used ? "usado" : "vigente";

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Boleto</title>
<style>
  /* === ESTILOS DEL BOLETO === */
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #121212;
    color: #fff;
  }

  .ticket {
    position: relative;
    max-width: 900px;
    margin: 1rem auto;
    background: linear-gradient(to bottom, #4a0c23, #121212);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: row;
    gap: 2rem;
    overflow: hidden;
  }

  /* Fondo Cosette */
  .cosette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-repeat: no-repeat;
    background-position: center;
    background-size: min(92vh, 950px);
    opacity: 0.20;
    filter: grayscale(100%);
    z-index: 0;
  }
  :root { --cosette-url: url("${cosetteDark}"); }
  @media (prefers-color-scheme: light) {
    :root { --cosette-url: url("${cosetteLight}"); }
  }
  .cosette { background-image: var(--cosette-url); }

  /* Encabezado */
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
    z-index: 1;
  }

  .brand img {
    width: clamp(96px, 14vw, 160px); /* logo 200% */
    height: auto;
  }

  .title {
    display: flex;
    flex-direction: column;
  }

  .title h1 {
    margin: 0;
    font-size: 1.8rem;
  }

  .title small {
    color: #ccc;
  }

  /* Info */
  .info {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
  }

  .row strong {
    font-weight: 700;
  }

  /* QR */
  .qr {
    position: relative;
    z-index: 1;
  }

  .qr img {
    width: clamp(220px, 32vw, 320px); /* QR más discreto */
    height: auto;
    border-radius: 8px;
    background: #fff;
    padding: 0.5rem;
  }

  /* Footer */
  .footer {
    margin-top: 1rem;
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #ccc;
    position: relative;
    z-index: 1;
  }

  .footer strong {
    font-weight: 700;
  }

  /* Estado */
  .status {
    position: absolute;
    top: 1rem;
    right: 1rem;
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    z-index: 2;
  }
  .status.usado {
    background: #222;
    color: #eee;
    border: 2px solid #666;
  }
  .status.vigente {
    background: #0f5132;
    color: #fff;
    border: 2px solid #198754;
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="cosette"></div>
    <div class="status ${statusClass}">✓ ${statusLabel}</div>

    <div class="info">
      <div class="header">
        <div class="brand">
          <picture>
            <source srcset="${logoDark}" media="(prefers-color-scheme: dark)">
            <img src="${logoLight}" alt="Logo">
          </picture>
        </div>
        <div class="title">
          <h1>Los Miserables</h1>
          <small>Boleto General</small>
        </div>
      </div>

      <div class="row"><strong>Función:</strong> ${ticket.event_name}</div>
      <div class="row"><strong>Usuario:</strong> ${ticket.buyer_name} — ${ticket.buyer_email}</div>
      <div class="row"><strong>Código:</strong> ${ticket.student_code || "—"}</div>
      <div class="row"><strong>ID:</strong> ${ticket.id}</div>
    </div>

    <div class="qr">
      <img src="${qrData}" alt="QR del boleto">
    </div>
  </div>

  <div class="footer">
    <span>Presenta este boleto en la entrada</span>
    <span><strong>CLASIFICACIÓN:</strong> 12 años en adelante.</span>
    <span>No está permitido introducir alimentos y bebidas a la sala.</span>
  </div>
</body>
</html>
  `);
});

// ===================
// START SERVER
// ===================
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`URL BASE: ${process.env.BASE_URL}`);
});
