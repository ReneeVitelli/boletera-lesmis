import { Router } from 'express';
import { insertTicket, getTicket, markUsed } from '../db.js';
import { createTicketPDF } from '../pdf.js';
import { sendTicketEmail } from '../mailer.js';

const router = Router();

/* =======================
   Helpers de autorización
   ======================= */
function authOkForIssue(req) {
  const provided =
    req.get('X-Issue-Key') ||
    req.query.key ||
    req.body?.key;

  const required = process.env.ISSUE_API_KEY;
  if (!required) return false;
  return provided && String(provided) === String(required);
}

function authOkForUse(req) {
  // Se admite por header o query/body. PIN tecleado por staff.
  const provided =
    req.get('X-Use-Key') ||
    req.get('X-Issue-Key') ||
    req.query.key ||
    req.body?.key;

  const required =
    process.env.USE_API_KEY || // clave dedicada a uso
    process.env.ISSUE_API_KEY; // fallback si no se definiera USE_API_KEY

  if (!required) return false;
  return provided && String(provided) === String(required);
}

/* =======================
   Emitir boleto (solo backend/admin)
   ======================= */
router.post('/tickets/issue', async (req, res) => {
  try {
    if (!authOkForIssue(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const {
      id,
      buyer_name = '—',
      buyer_email = '',
      buyer_phone = '',
      function_id = 'funcion-1',
      function_label = 'Función',
      event_title = process.env.EVENT_TITLE || 'Evento',
      currency = process.env.CURRENCY || 'MXN',
      price = 0,
      payment_id = null,
    } = req.body || {};

    const ticket = {
      id,
      buyer_name,
      buyer_email,
      buyer_phone,
      function_id,
      function_label,
      event_title,
      currency,
      price: Number(price) || 0,
      payment_id: payment_id ? String(payment_id) : null,
    };

    // 1) Persiste en base
    insertTicket(ticket);

    // 2) Genera PDF
    const baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    const pdfPath = await createTicketPDF({ ticket, baseUrl, senderName: process.env.SENDER_NAME || 'Boletera' });

    // 3) Envía correo si hay destinatario
    if (buyer_email && buyer_email.includes('@')) {
      await sendTicketEmail({
        to: buyer_email,
        subject: `${event_title} – ${function_label} (Boleto)`,
        text: `Hola ${buyer_name},\n\nAdjuntamos tu boleto. Valida en ${baseUrl}/t/${ticket.id}\n\n¡Gracias!`,
        attachments: [{ filename: `boleto-${ticket.id}.pdf`, path: pdfPath }],
      });
    }

    return res.json({ ok: true, id: ticket.id || null });
  } catch (err) {
    console.error('[tickets/issue] ERROR:', err?.message || err);
    return res.status(500).json({ error: 'issue_failed', details: String(err?.message || err) });
  }
});

/* =======================
   Consultar un boleto (JSON)
   ======================= */
router.get('/tickets/:id', (req, res) => {
  const id = req.params.id;
  const t = getTicket(id);
  if (!t) {
    return res.status(404).json({ error: 'not_found', id });
  }
  return res.json(t);
});

/* =======================
   Marcar como usado (protegido por PIN)
   ======================= */
router.post('/tickets/:id/use', (req, res) => {
  try {
    if (!authOkForUse(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const id = req.params.id;
    const ok = markUsed(id); // debe marcar used_at = CURRENT_TIMESTAMP en DB
    return res.json({ ok, id });
  } catch (err) {
    console.error('[tickets/use] ERROR:', err?.message || err);
    return res.status(500).json({ error: 'use_failed' });
  }
});

/* =======================
   Página de validación /t/:id
   ======================= */
router.get('/t/:id', (req, res) => {
  const id = req.params.id;
  const t = getTicket(id);
  const baseUrl = process.env.BASE_URL || '';
  const frontendUrl = process.env.FRONTEND_URL || '';

  // HTML minimal, con botón que pide PIN al staff
  const notFound = !t;
  const valid = !!t;
  const used = t?.used_at ? true : false;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Boleto – ${valid ? 'Válido' : 'No encontrado'}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; }
  .ok { color: #0a7f27; font-weight: 700; }
  .bad { color: #b00020; font-weight: 700; }
  .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; margin-top: 16px; }
  .row { margin: 8px 0;}
  button { padding: 10px 14px; border-radius: 8px; border: 0; background: #111827; color: white; cursor: pointer; }
  button[disabled] { background: #9ca3af; cursor: not-allowed; }
  .muted { color: #6b7280; font-size: 0.95rem; }
  a { color: #2563eb; text-decoration: none; }
</style>
</head>
<body>
  ${valid
    ? `<h2 class="ok">✅ Boleto válido</h2>`
    : `<h2 class="bad">❌ Boleto no encontrado</h2>`}

  <div class="box">
    <div class="row"><strong>ID:</strong> ${id}</div>
    ${valid ? `<div class="row"><strong>Función:</strong> ${t.function_label || '—'}</div>` : ''}
    ${valid ? `<div class="row"><strong>Nombre:</strong> ${t.buyer_name || '—'}</div>` : ''}
    ${valid ? `<div class="row"><strong>Correo:</strong> ${t.buyer_email || '—'}</div>` : ''}
    ${valid ? `<div class="row"><strong>Precio:</strong> ${t.price || 0} ${t.currency || 'MXN'}</div>` : ''}
    ${valid ? `<div class="row"><strong>Estado:</strong> <span id="status">${used ? 'USADO' : 'NO USADO'}</span></div>` : ''}
  </div>

  ${valid
    ? `<div class="row" style="margin-top:16px">
         <button id="btn-use" ${used ? 'disabled' : ''}>Marcar como usado</button>
       </div>`
    : ''}

  ${baseUrl ? `<p class="muted" style="margin-top:16px">Verifica también en: <a href="${baseUrl}/t/${id}" target="_blank">${baseUrl}/t/${id}</a></p>` : ''}

  ${frontendUrl ? `<p class="muted">Ir a la boletera: <a href="${frontendUrl}" target="_blank">${frontendUrl}</a></p>` : ''}

<script>
(function(){
  const ticketId = ${JSON.stringify(id)};
  const btn = document.getElementById('btn-use');
  const statusEl = document.getElementById('status');

  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      let key = window.sessionStorage.getItem('use_key');
      if (!key) {
        key = window.prompt('PIN de uso (staff):');
        if (!key) return;
        window.sessionStorage.setItem('use_key', key);
      }

      const resp = await fetch('/api/tickets/' + encodeURIComponent(ticketId) + '/use?key=' + encodeURIComponent(key), {
        method: 'POST'
      });

      if (resp.status === 401) {
        // PIN incorrecto o falta. Pide de nuevo.
        window.sessionStorage.removeItem('use_key');
        alert('PIN incorrecto. Inténtalo otra vez.');
        return;
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(()=> '');
        alert('Error marcando como usado: ' + (txt || resp.status));
        return;
      }

      const data = await resp.json().catch(()=> ({}));
      if (data && data.ok) {
        if (statusEl) statusEl.textContent = 'USADO';
        btn.disabled = true;
        alert('Boleto marcado como usado.');
      } else {
        alert('No se pudo marcar. Inténtalo otra vez.');
      }
    } catch (e) {
      alert('Error: ' + (e && e.message ? e.message : e));
    }
  });
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

export default router;
