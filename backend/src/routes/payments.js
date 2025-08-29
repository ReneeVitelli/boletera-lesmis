import express from 'express';
import { createPreference, getPayment } from '../mercadoPago.js';
import db from '../db.js';

const router = express.Router();

// =====================
// Crear preferencia de pago (desde el frontend)
// =====================
router.post('/preference', async (req, res) => {
  try {
    const {
      title,
      quantity,
      price,
      currency,
      success_url,
      failure_url,
      pending_url,
      metadata
    } = req.body;

    const FRONT = process.env.FRONTEND_URL || 'http://localhost:5173';

    const isHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);
    const fallbackSuccess = 'https://example.org/ok';
    const success = isHttps(success_url) ? success_url : fallbackSuccess;
    const failure = isHttps(failure_url) ? failure_url : success;
    const pending = isHttps(pending_url) ? pending_url : success;

    console.log('[preference] req.body:', { title, quantity, price, currency, success_url, failure_url, pending_url });
    console.log('[preference] back_urls ->', { success, failure, pending });

    const pref = await createPreference({
      title,
      quantity,
      price,
      currency,
      backUrls: { success, failure, pending },
      metadata
    });

    console.log('[preference] MP response keys:', Object.keys(pref || {}));
    console.log('[preference] init_point:', pref?.init_point, 'sandbox_init_point:', pref?.sandbox_init_point);

    res.json({ ok: true, preference: pref });
  } catch (e) {
    console.error('[preference] ERROR:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// =====================
// Webhook de Mercado Pago (notificaciones)
const webhookHandler = async (req, res) => {
  try {
    // Logs completos para depurar
    console.log('[webhook] query:', req.query);
    console.log('[webhook] body:', req.body);

    // 1) Intentar extraer paymentId de los campos típicos
    let paymentId =
      req.query['data.id'] ||
      req.body?.data?.id ||
      req.query?.id ||
      req.body?.id ||
      null;

    // 2) Si viene 'resource' como URL, intenta extraer el número final
    const resource = req.query?.resource || req.body?.resource;
    if (!paymentId && typeof resource === 'string') {
      const m = resource.match(/\/payments\/(\d+)/i);
      if (m) paymentId = m[1];
    }

    // 3) Tipo de evento (payment / merchant_order / etc.)
    const type = req.query?.type || req.body?.type || req.query?.topic || req.body?.topic;

    // Si no hay ID o no es de pago, respondemos 200 (evita reintentos infinitos)
    if (!paymentId || (type && !String(type).toLowerCase().includes('payment'))) {
      console.log('[webhook] sin paymentId o no es de tipo payment. type=', type, ' paymentId=', paymentId);
      return res.sendStatus(200);
    }

    // 4) Intentar obtener el pago real
    let payment;
    try {
      payment = await getPayment(paymentId);
    } catch (err) {
      console.error('[webhook] getPayment error:', err);
      return res.sendStatus(200);
    }

    const status = payment?.status;
    console.log('[webhook] payment.id=', payment?.id, 'status=', status);

    // Guardar registro del pago siempre que tengamos datos
    try {
      db.prepare(
        'INSERT OR REPLACE INTO payments (id, mp_payment_id, status, buyer_email, raw_json) VALUES (?, ?, ?, ?, ?)'
      ).run(
        payment?.id ? String(payment.id) : String(paymentId),
        payment?.id ? String(payment.id) : String(paymentId),
        status || null,
        payment?.payer?.email || null,
        JSON.stringify(payment || { received: { query: req.query, body: req.body } })
      );
    } catch (dbErr) {
      console.error('[webhook] DB insert error:', dbErr);
    }

    // 5) Emitir boletos solo si está aprobado
    if (status === 'approved') {
      const buyer_name = payment?.additional_info?.payer?.first_name || '';
      const buyer_email = payment?.payer?.email || null;
      const quantity = payment?.additional_info?.items?.[0]?.quantity || 1;
      const title = payment?.additional_info?.items?.[0]?.title || process.env.EVENT_TITLE;
      const price = Math.round(payment?.transaction_amount || process.env.PRICE_GENERAL);
      const currency = payment?.currency_id || process.env.CURRENCY || 'MXN';
      const function_id = payment?.metadata?.function_id || 'funcion-1';
      const function_label = payment?.metadata?.function_label || title;

      try {
        const resp = await fetch(`${process.env.BASE_URL}/api/tickets/issue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyer_name,
            buyer_email,
            function_id,
            function_label,
            quantity,
            price,
            currency,
            event_title: title
          })
        });
        console.log('[webhook] issue tickets ->', resp.status);
      } catch (issErr) {
        console.error('[webhook] issue error:', issErr);
      }
    } else {
      console.log('[webhook] pago no aprobado (status=', status, '), no se emiten boletos.');
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error('[webhook] ERROR inesperado:', e);
    return res.sendStatus(200);
  }
};

// Aceptar POST en ambas rutas
router.post('/webhook', webhookHandler);
router.post('/pagos/webhook', webhookHandler);

// GET de cortesía en ambas rutas
router.get('/webhook', (req, res) => res.sendStatus(200));
router.get('/pagos/webhook', (req, res) => res.sendStatus(200));


// =====================
// Consultar un pago puntual (debug)
// =====================
router.get('/payment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPayment(id);
    res.json({ ok: true, payment });
  } catch (e) {
    console.error('[payment/:id] ERROR:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
