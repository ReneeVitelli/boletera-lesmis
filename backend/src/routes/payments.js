import { Router } from 'express';
import { createPreference } from '../mercadoPago.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/* ------------------------ helpers ------------------------ */

/** Consideramos válido un payment_id real si es numérico y largo (11+). */
function isLikelyPaymentId(id) {
  return typeof id === 'string' && /^\d{11,}$/.test(id);
}

/** Lee un pago en MP; si no existe (404) devuelve null sin ruido. */
async function getPayment(paymentId, accessToken) {
  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
    console.log('[mp] getPayment 404 (not found) id=', paymentId);
    return null;
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[mp] getPayment ${res.status} ${txt}`);
  }
  return res.json();
}

/* --------------------- crear preferencia ------------------ */

/** EN: /api/payments/preference  ES: /api/pagos/preferencia (alias) */
async function handleCreatePreference(req, res) {
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
      metadata: metadata || {}, // puedes mandar function_id, buyer_name, etc. desde el frontend
    });

    return res.json({
      id: pref.id,
      init_point: pref.init_point,
      sandbox_init_point: pref.sandbox_init_point,
      back_urls: pref.back_urls,
    });
  } catch (err) {
    console.warn('[preference] WARN:', err?.message || err);
    return res
      .status(500)
      .json({ error: 'preference_failed', details: String(err?.message || err) });
  }
}

router.post('/preference', handleCreatePreference);
router.post('/preferencia', handleCreatePreference); // alias ES

/* ------------------------- webhook ------------------------ */

/** EN: /api/payments/webhook  ES: /api/pagos/webhook (alias) */
async function handleWebhook(req, res) {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const q = req.query || {};
    const body = req.body || {};

    // Normaliza ID y tipo
    let paymentId =
      q['data.id'] || q.id || body?.data?.id || body?.id || body?.resource;
    const type = q.type || q.topic || body?.type || body?.topic;

    // Ignora eventos que no sean de pago (merchant_order, etc.)
    if (type && !String(type).includes('payment') && !String(type).includes('pago')) {
      console.log('[webhook] ignorado topic/type=', type, 'id=', paymentId);
      return res.status(200).send('OK');
    }

    // A veces llega un "id" que no es payment_id (número de operación corto de la UI).
    if (!paymentId || !isLikelyPaymentId(String(paymentId))) {
      console.log('[webhook] id no compatible (no payment_id real):', paymentId, 'type=', type);
      return res.status(200).send('OK');
    }

    // Consulta el pago en MP
    const payment = await getPayment(String(paymentId), accessToken);
    if (!payment) {
      // 404 silencioso ya logueado en helper
      return res.status(200).send('OK');
    }

    const status = payment?.status;
    console.log('[webhook] payment.id=', paymentId, 'status=', status);

    // Solo procesa aprobados
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

    // Idempotencia por payment_id: el endpoint /tickets/issue debe ignorar si ya existe.
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
    // Respondemos 200 para evitar reintentos agresivos, pero logueamos suave.
    console.warn('[webhook] WARN:', err?.message || err);
    return res.status(200).send('OK');
  }
}

router.post('/webhook', handleWebhook);
router.post('/pagos/webhook', (req, res, next) => {
  // alias ES → reutilizamos la misma lógica
  handleWebhook(req, res, next);
});

export default router;
