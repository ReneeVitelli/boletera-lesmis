// backend/src/app.js
import express from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import db, { insertTicket, getTicket, markUsed } from "./db.js";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
console.log("URL BASE:", BASE_URL);

// ---------- CONFIG EMAIL ----------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const MAIL_ADMIN = process.env.MAIL_ADMIN;

// ---------- UTILS ----------
function formatPrice(mxn) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(mxn);
}

// ---------- HTML DEL BOLETO ----------
function renderTicketHtml(ticket, qrDataUrl) {
  const logoLight = process.env.LOGO_URL_LIGHT || "";
  const logoDark = process.env.LOGO_URL_DARK || "";

  const watermarkLight = process.env.WATERMARK_URL_LIGHT || "";
  const watermarkDark = process.env.WATERMARK_URL_DARK || "";

  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boleto — ${ticket.show}</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: #111;
        color: #eee;
        display: flex;
        justify-content: center;
        padding: 2rem;
      }
      .ticket {
        position: relative;
        max-width: 800px;
        background: linear-gradient(135deg, #1a1a1a, #000);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 0 30px rgba(0,0,0,0.6);
        overflow: hidden;
      }
      .ticket::before {
        content: "";
        position: absolute;
        inset: 0;
        background: url('${watermarkLight}') center/contain no-repeat;
        opacity: 0.08;
        pointer-events: none;
      }
      @media (prefers-color-scheme: dark) {
        .ticket::before {
          background: url('${watermarkDark}') center/contain no-repeat;
        }
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
      }
      .header img.logo {
        height: 80px;
        width: auto;
      }
      @media (min-width: 768px) {
        .header img.logo {
          height: 100px;
        }
      }
      .title {
        font-size: 1.6rem;
        font-weight: bold;
      }
      .subtitle {
        font-size: 0.9rem;
        opacity: 0.8;
      }
      .qr {
        float: right;
        margin: 1rem;
      }
      .qr img {
        width: 180px;
        height: 180px;
      }
      .field { margin: 0.3rem 0; }
      .label { font-weight: bold; }
      .status {
        margin-top: 1rem;
        padding: 0.3rem 0.8rem;
        border-radius: 8px;
        display: inline-block;
      }
      .status.used {
        background: #444;
        color: #ccc;
      }
      .status.unused {
        background: #2e7d32;
        color: #fff;
      }
      .footer {
        margin-top: 2rem;
        font-size: 0.8rem;
        opacity: 0.7;
      }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="header">
        <picture>
          <source srcset="${logoDark}" media="(prefers-color-scheme: light)" />
          <img src="${logoLight}" alt="logo" class="logo" />
        </picture>
        <div>
          <div class="title">${ticket.show}</div>
          <div class="subtitle">Boleto digital</div>
        </div>
      </div>

      <div class="qr">
        <img src="${qrDataUrl}" alt="QR" />
      </div>

      <div class="field"><span class="label">Función:</span> ${ticket.funcion}</div>
      <div class="field"><span class="label">Comprador:</span> ${ticket.name} — ${ticket.email}</div>
      <div class="field"><span class="label">Precio:</span> ${formatPrice(ticket.price)}</div>
      <div class="field"><span class="label">Estado:</span>
        <span class="status ${ticket.used ? "used" : "unused"}">
          ${ticket.used ? "Usado" : "No usado"}
        </span>
      </div>
      <div class="field"><span class="label">ID:</span> ${ticket.id}</div>

      <div class="footer">
        Presenta este boleto en la entrada
      </div>
    </div>
  </body>
  </html>
  `;
}

// ---------- ENDPOINTS ----------
app.get("/health", (req, res) => {
  res.json({ ok: true, db: true, mail: true, now: new Date().toISOString() });
});

app.post("/api/tickets/issue", async (req, res) => {
  try {
    const { show, funcion, name, email, price } = req.body;

    if (req.get("X-Issue-Key") !== process.env.ISSUE_KEY) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const ticket = await insertTicket({
      show,
      funcion,
      name,
      email,
      price,
    });

    const ticketUrl = `${BASE_URL}/t/${ticket.id}`;
    const qrDataUrl = await QRCode.toDataURL(ticketUrl);

    // Enviar correo al comprador
    await transporter.sendMail({
      from: `"Los Miserables" <${process.env.MAIL_USER}>`,
      to: email,
      cc: MAIL_ADMIN,
      subject: `Tus boletos: ${show} — ${funcion}`,
      html: `
        <h2>🎭 ${show}</h2>
        <p><b>Función:</b> ${funcion}</p>
        <p><b>Comprador:</b> ${name} — ${email}</p>
        <p><b>Precio:</b> ${formatPrice(price)}</p>
        <p><a href="${ticketUrl}">Abrir mi boleto</a></p>
        <hr/>
        <p>Guarda este correo. Presenta el código/URL en la entrada.</p>
      `,
    });

    res.json({ ok: true, ...ticket, url: ticketUrl });
  } catch (err) {
    console.error("Error en emisión:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/t/:id", async (req, res) => {
  try {
    const ticket = await getTicket(req.params.id);
    if (!ticket) return res.status(404).send("No encontrado");

    const ticketUrl = `${BASE_URL}/t/${ticket.id}`;
    const qrDataUrl = await QRCode.toDataURL(ticketUrl);

    res.send(renderTicketHtml(ticket, qrDataUrl));
  } catch (err) {
    console.error("Error al mostrar ticket:", err);
    res.status(500).send("Error interno");
  }
});

app.post("/api/tickets/:id/use", async (req, res) => {
  try {
    const ticket = await markUsed(req.params.id);
    if (!ticket) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, id: ticket.id, used: ticket.used });
  } catch (err) {
    console.error("Error al marcar como usado:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
