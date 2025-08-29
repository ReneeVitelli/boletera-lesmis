import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ticketsRouter from './routes/tickets.js';
import paymentsRouter from './routes/payments.js';
import db from './db.js';

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Bypass del aviso de ngrok en visitas de navegador a /t/:id
app.use((req, res, next) => {
  try {
    // Solo GET a rutas de tickets tipo /t/<id>
    const esRutaTicket = /^\/t\/[a-z0-9-]+/i.test(req.path);
    const yaTraeParam = 'ngrok-skip-browser-warning' in req.query;

    if (
      process.env.BASE_URL?.includes('ngrok') && // solo si usas ngrok
      req.method === 'GET' &&
      esRutaTicket &&
      !yaTraeParam
    ) {
      const separador = req.url.includes('?') ? '&' : '?';
      return res.redirect(302, `${req.url}${separador}ngrok-skip-browser-warning=1`);
    }
  } catch (e) {
    // si algo falla, no bloquees el flujo
  }
  next();
});

// Rutas API
app.use('/api/tickets', ticketsRouter);
app.use('/api/payments', paymentsRouter);

// Vista simple de validación (para escáner QR en puerta)
app.get('/t/:id', (req, res) => {
  const { id } = req.params;
  const row = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!row) return res.status(404).send(`<h2>❌ Boleto no encontrado</h2>`);
  if (row.status === 'used') {
    return res.send(`<h2>⚠️ Boleto ya usado</h2><p>Usado: ${row.used_at}</p>`);
  }
  res.send(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style="font-family:sans-serif;padding:20px;">
        <h2>✅ Boleto válido</h2>
        <p><b>Función:</b> ${row.function_label}</p>
        <p><b>Nombre:</b> ${row.buyer_name || '—'}</p>
        <p><b>Boleto:</b> ${row.id}</p>
        <form method="post" action="/api/tickets/${row.id}/use">
          <button style="padding:10px 16px;font-size:16px;">Marcar como usado</button>
        </form>
      </body>
    </html>
  `);
});

// Servir frontend en producción (si lo compilas dentro de /web/dist)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
