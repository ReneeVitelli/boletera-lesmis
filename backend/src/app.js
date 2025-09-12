// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import db, { insertTicket, getTicket, markUsed } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ==== ENTORNO ====
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const ISSUE_KEY = process.env.ISSUE_KEY || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Correo (SMTP)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
const SMTP_USER = process.env.SES_SMTP_USER || process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SES_SMTP_PASS || process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Boletera <no-reply@boletera.local>';
const MAIL_BCC  = process.env.MAIL_BCC || '';
const MAIL_ADMIN = process.env.MAIL_ADMIN || '';

// Branding (logos)
const LOGO_URL_LIGHT = process.env.LOGO_URL_LIGHT || ''; // logo oscuro para fondos claros
const LOGO_URL_DARK  = process.env.LOGO_URL_DARK  || ''; // logo blanco para fondos oscuros

// ==== VISTA TICKET (extracto importante) ====
app.get('/t/:id', (req, res) => {
  const { id } = req.params;
  const t = getTicket(id);
  if (!t) {
    return res.status(404).send(`<html><body><h1>Ticket no encontrado</h1><p>ID: ${id}</p></body></html>`);
  }

  const used = !!t.used;
  const usedLabel = used ? 'Usado' : 'No usado';
  const btnLabel = used ? 'Usado' : 'Marcar como usado';

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${t.event_title} — Ticket</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{margin:0;font-family:system-ui,Arial,sans-serif;background:#0b0e14;color:#e5e7eb;}
    .wrap{display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px;}
    .card{max-width:720px;width:100%;border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden;background:#111827}
    .header{display:flex;align-items:center;padding:20px;border-bottom:1px solid rgba(255,255,255,.08);}
    .logo{height:60px;width:auto}
    .body{padding:20px;}
    .footer{padding:20px;border-top:1px solid rgba(255,255,255,.08);}
    .btn{padding:10px 16px;border-radius:10px;border:0;cursor:pointer;font-weight:600}
    .btn-primary{background:#111;color:#fff}
    .btn[disabled]{opacity:.6;cursor:not-allowed}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <picture>
          ${LOGO_URL_LIGHT || LOGO_URL_DARK ? `
            <source srcset="${LOGO_URL_LIGHT}" media="(prefers-color-scheme: light)">
            <source srcset="${LOGO_URL_DARK}"  media="(prefers-color-scheme: dark)">
            <img class="logo" src="${LOGO_URL_DARK}" alt="logo Grupo Teatrapé"/>
          ` : ``}
        </picture>
        <h1 style="margin-left:12px">${t.event_title}</h1>
      </div>
      <div class="body">
        <p><strong>Función:</strong> ${t.function_label}</p>
        <p><strong>Comprador:</strong> ${t.buyer_name} — ${t.buyer_email}</p>
        <p><strong>Precio:</strong> ${t.price} ${t.currency}</p>
        <p><strong>Estado:</strong> <span id="st">${usedLabel}</span></p>
        <p><small>ID: ${id}</small></p>
      </div>
      <div class="footer">
        <button id="btn" class="btn btn-primary" ${used ? 'disabled' : ''}>${btnLabel}</button>
      </div>
    </div>
  </div>

  <script>
    const id = ${JSON.stringify(id)};
    const st = document.getElementById('st');
    const btn = document.getElementById('btn');
    if(btn){
      btn.addEventListener('click', async ()=>{
        if(btn.disabled) return;
        btn.disabled=true;
        try{
          const r=await fetch('/api/tickets/'+id+'/use',{method:'POST'});
          const j=await r.json();
          if(j.ok && j.used){
            st.textContent='Usado';
            btn.textContent='Usado';
          } else {
            btn.disabled=false;
            alert('No se pudo marcar como usado');
          }
        }catch(e){
          btn.disabled=false;
          alert('Error:'+e);
        }
      });
    }
  </script>
</body>
</html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// (resto del app.js sin cambios, rutas API, correo, etc.)
