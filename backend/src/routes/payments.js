import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createPreference } from '../mercadoPago.js';

// Router
const router = Router();

/** Resuelve URL del frontend (Netlify) y del backend (Render) */
function getFrontendURL() {
  const url = (process.env.FRONTEND_URL || '').trim();
  if (url) return url.replace(/\/+$/, '');
  // Fallback razonable si faltara la variable
  return 'https://los-miserables.netlify.app';
}

function getBackendBaseURL(req) {
  // Preferimos BASE_URL de env; si no está, inferimos del request
  const envBase = (process.env.BASE_URL || '').trim();
  if (envBase) return envBase.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

/** Llama a MP para leer un pago por id */
async function getPaymentById(paymentId, accessToken) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[MP getPayment] ${res.status} ${text}`);
  }
  return res.json();
}

/** Crea preferencia (Checkout Pro) */
router.post('/preference', async (req, res) => {
  try {
    const frontend = getFrontendURL();
    const backend = getBackendBaseURL(req);

    const {
      title,
      quantity,
      price,          // aceptamos "price" (frontend)…
      unit_price,     // …o "unit_price" si alguien lo manda así
      currency,
      currency_id,
      success_url,
      failure_url,
      pending_url,
      metadata = {},
    } = req.body || {};

    const qty = Number(quantity || 1);
    const unit = Number(
      typeof unit_price !== 'undefined' ? unit_price : (price || 0)
    );

    const back_urls = {
      success: (success_url || `${frontend}/?ok=1`),
      failure: (failure_url || `${frontend}/?ok=1`),
      pending: (pending_url || `${frontend}/?ok=1`),
    };

    const pref = await createPreference({
      title: title || 'Boleto',
      quantity: Number.isFinite(qty) ? qty : 1,
      unit_price: Number.isFinite(unit) ? unit : 0,
      currency_id: currency || currency_id || 'MXN',
      back_urls,
      auto_return: 'approved',
      notification_url: `${backend}/api/payments/webhook`,
      metadata, // aquí puedes mandar buyer_name, buyer_email, function_id, etc.
    });

    return res.json({
      id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      back_urls: pref.back_urls,
    });
  } catch (err) {
    console.error('[preference] ERROR:', err?.message || err);
    return res
      .status(500)
      .json({ error: 'preference_failed', details: String(err?.message || err) });
  }
});

/** Webhook (idempotente por payment_id) */
router.post('/webhook', async (req, res) => {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[webhook] Falta MP_ACCESS_TOKEN');
      return res.status(200).send('OK');
    }

    // Render/Netlify suelen reenviar query y body con distintas formas
    const q = req.query || {};
    const body = req.body || {};
    const type = q.type || q.topic || body?.type || body?.topic;

    // ignorar notificaciones que no sean de payment
    if (type && !String(type).includes('payment')) {
      const pid =
        q['data.id'] || q.id || body?.data?.id || body?.id || body?.resource;
      console.log('[webhook] ignorado type=', type, 'paymentId=', pid);
      return res.status(200).send('OK');
    }

    let paymentId =
      q['data.id'] || q.id || body?.data?.id || body?.id || body?.resource;

    if (!paymentId) {
      console.log('[webhook] sin paymentId. query:', q, ' body:', body);
      return res.status(200).send('OK');
    }

    const payment = await getPaymentById(paymentId, accessToken);
    const status = payment?.status;
    console.log('[webhook] payment.id=', paymentId, 'status=', status);

    if (status !== 'approved') {
      return res.status(200).send('OK');
    }

    // Datos del comprador / función
    const meta = payment?.metadata || {};
    const buyer_name =
      `${payment?.payer?.first_name || ''} ${payment?.payer?.last_name || ''}`.trim() ||
      meta.buyer_name ||
      '—';
    const buyer_email = payment?.payer?.email || meta.buyer_email || '';
    const function_id = meta.function_id || 'funcion-1';
    const function_label = meta.function_label || 'Función';
    const event_title = process.env.EVENT_TITLE || 'Evento';
    const currency = payment?.currency_id || process.env.CURRENCY || 'MXN';
    const amount =
      Number(
        payment?.transaction_amount || meta.price || process.env.PRICE_GENERAL || 0
      ) || 0;

    // Emite boleto (la ruta /api/tickets/issue valida idempotencia por payment_id)
    const ticketId = uuidv4();
    const backend = getBackendBaseURL(req);
    const issueKey = process.env.ISSUE_API_KEY || '';

    const issueRes = await fetch(`${backend}/api/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(issueKey ? { 'X-Issue-Key': issueKey } : {}),
      },
      body: JSON.stringify({
        id: ticketId,
        buyer_name,
        buyer_email,
        buyer_phone: meta.buyer_phone || '',
        function_id,
        function_label,
        event_title,
        currency,
        price: amount,
        payment_id: String(paymentId),
      }),
    });

    console.log('[webhook] issue tickets ->', issueRes.status);
    // Siempre 200 para que MP no reintente en loop
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] ERROR:', err?.message || err);
    // Respondemos 200 para evitar reintentos agresivos
    return res.status(200).send('OK');
  }
});

/** Alias en español */
router.post('/pagos/webhook', (req, res, next) => {
  req.url = '/webhook';
  next();
});

export default router;
