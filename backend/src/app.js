// Carga variables de entorno (Render también las inyecta, pero local ayuda)
import 'dotenv/config.js';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import path from 'node:path';
import fs from 'node:fs';

// IMPORTANTE: ejecuta migraciones de la BD por side-effect (NO default)
import './db.js';

import { initMP } from './mercadoPago.js';
import paymentsRouter from './routes/payments.js';
import ticketsRouter from './routes/tickets.js';
import { getTicket, markUsed } from './db.js';

const app = express();

// Middlewares básicos
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Inicializa Mercado Pago
initMP();

// Rutas API
app.use('/api/payments', paymentsRouter);
app.use('/api/tickets', ticketsRouter);

// Healthcheck para Render
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Página simple de validación de boletos: GET /t/:id
app.get('/t/:id', (req, res) => {
  const t = getTicket(req.params.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!t) {
    return res.status(404).send(`
      <html><body style="font-family:system-ui;padding:24px">
        <h2>❌ Boleto no encontrado</h2>
        <p>ID: ${req.params.id}</p>
      </body></html>
    `);
  }

  const usedMsg = t.used ? '⚠️ Ya fue marcado como usado' : 'Disponible';
  const btn = t.used
    ? ''
    : `<button id="useBtn">Marcar como usado</button>
       <script>
         document.getElementById('useBtn').onclick = async () => {
           const r = await fetch('/api/tickets/${t.id}/use', {method:'POST'});
           location.reload();
         };
       </script>`;

  return res.send(`
    <html><body style="font-family:system-ui;padding:24px;max-width:640px">
      <h2>✅ Boleto válido</h2>
      <p><b>Función:</b> ${t.function_label || '—'}</p>
      <p><b>Nombre:</b> ${t.buyer_name || '—'}</p>
      <p><b>Boleto:</b> ${t.id}</p>
      <p><b>Estado:</b> ${usedMsg}</p>
      ${btn}
    </body></html>
  `);
});

// (Opcional) Servir frontend si existe ./frontend/dist
try {
  const distDir = path.resolve('./frontend/dist');
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(indexHtml));
    console.log('[static] sirviendo frontend desde', distDir);
  } else {
    console.log('[static] sin frontend/dist; sólo API');
  }
} catch (e) {
  console.log('[static] skip static serve:', e?.message || e);
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
