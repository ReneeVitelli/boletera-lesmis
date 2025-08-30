import { Router } from 'express';
import { createPreference } from '../mercadoPago.js';
import { v4 as uuidv4 } from 'uuid';

// Node 18+ trae fetch global
const router = Router();

/** Consulta un pago en Mercado Pago */
async function getPayment(paymentId, accessToken) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[MP getPayment] ${res.status} ${txt}`);
  }
  return res.json();
}

/** Crea preferencia de pago (Checkout Pro) */
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
      metadata,
    } = req.body || {};

    const back_urls = {
      success: success_url || 'https://example.org/ok',
      failure: failure_url || success_url || 'https://example.org/ok',
      pending: pending_url || success_url || 'https://example.org/ok',
    };

    const pref = await createPreference({
      title: title || 'Boleto',
      quantity: Number(quantity || 1),
      unit_price: Number(price || 0),
      currency_id: currency || 'MXN',
      back_urls,
      auto_return: 'approved',
      notification_url: `${process.env.BASE_URL}/api/payments/webhook`,
      metadata: metadata || {}, // aquí puedes mandar function_id, buyer_name, etc. desde el frontend
    });

    return res.json({
      id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      back_urls: pref.back_urls,
    });
  } catch (err) {
    console.error('[preferencia] ERROR:', err?.message || err);
    return res
      .status(500)
      .json({ error: 'preference_failed', details: String(err?.message || err) });
  }
});

/** Webhook de Mercado Pago (idempotente con payment_id) */
router.post('/webhook', async (req, res) => {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const q = req.query || {};
    const body = req.body || {};

    // Normaliza el ID y el tipo
    let paymentId =
      q['data.id'] || q.id || body?.data?.id || body?.id || body?.resource;
    const type = q.type || q.topic || body?.type || body?.topic;

    // Ignora eventos que no sean de pago (merchant_order, etc.)
    if (type && !String(type).includes('payment')) {
      console.log('[webhook] ignorado type=', type, 'paymentId=', paymentId);
      return res.status(200).send('OK');
    }

    if (!paymentId) {
      console.log('[webhook] sin paymentId. query:', q, ' body:', body);
      return res.status(200).send('OK');
    }

    const payment = await getPayment(paymentId, accessToken);
    const status = payment?.status;
    console.log('[webhook] payment.id=', paymentId, 'status=', status);

    // Solo procesar si está aprobado
    if (status !== 'approved') {
      return res.status(200).send('OK');
    }

    // Datos para el ticket
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

    // Genera un id de boleto y delega emisión al endpoint interno
    const ticketId = uuidv4();
    const origin = process.env.BASE_URL || 'http://localhost:8080';

    const issueRes = await fetch(`${origin}/api/tickets/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        payment_id: String(paymentId), // ← clave para idempotencia
      }),
    });

    console.log('[webhook] issue tickets ->', issueRes.status);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] ERROR:', err?.message || err);
    // Respondemos 200 para evitar reintentos agresivos de MP
    return res.status(200).send('OK');
  }
});

/** Alias en español: /api/pagos/webhook → /api/payments/webhook */
router.post('/pagos/webhook', (req, res, next) => {
  req.url = '/webhook';
  next();
});

export default router;
