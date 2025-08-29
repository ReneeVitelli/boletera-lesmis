import { Router } from 'express';
import { createPreference } from '../mercadoPago.js';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { insertTicket, getTicketByPaymentId } from '../db.js';

const router = Router();

// Utilidad: consultar detalle del pago en MP
async function getPayment(paymentId, accessToken) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
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

// 1) Crear preferencia (checkout)
router.post('/preference', async (req, res) => {
  try {
    const { title, quantity, price, currency, success_url, failure_url, pending_url } = req.body || {};
    const back = {
      success: success_url || 'https://example.org/ok',
      failure: failure_url || success_url || 'https://example.org/ok',
      pending: pending_url || success_url || 'https://example.org/ok',
    };

    const preference = await createPreference({
      title: title || 'Boleto',
      quantity: quantity || 1,
      unit_price: price || 1,
      currency_id: currency || 'MXN',
      back_urls: back,
      auto_return: 'approved',
      notification_url: `${process.env.BASE_URL}/api/payments/webhook`,
    });

    const payload = {
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
      back_urls: preference.back_urls,
    };
    res.json(payload);
  } catch (err) {
    console.error('[preference] ERROR:', err?.message || err);
    res.status(500).json({ error: 'preference_failed', details: String(err?.message || err) });
  }
});

// 2) Webhook (idempotente)
router.post('/webhook', async (req, res) => {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    const q = req.query || {};
    const body = req.body || {};

    // Normalizar: podemos recibir payment id por query o body
    // Casos: ?type=payment&data.id=123  |  ?topic=payment&id=123  |  body.data.id=123
    let paymentId = q['data.id'] || q.id || body?.data?.id || body?.id || body?.resource;
    const type = q.type || q.topic || body?.type || body?.topic;

    if (type && !String(type).includes('payment')) {
      // Ignora merchant_order u otros
      console.log('[webhook] ignorado type=', type, 'paymentId=', paymentId);
      return res.status(200).send('OK');
    }

    if (!paymentId) {
      console.log('[webhook] sin paymentId. query:', q, ' body:', body);
      return res.status(200).send('OK');
    }

    // Consulta el pago en MP
    const payment = await getPayment(paymentId, accessToken);
    const status = payment?.status;
    console.log('[webhook] payment.id=', paymentId, 'status=', status);

    // Solo actuamos cuando está aprobado
    if (status !== 'approved') {
      return res.status(200).send('OK');
    }

    // IDEMPOTENCIA: si ya emitimos para este payment_id, NO repetir
    const already = getTicketByPaymentId(String(paymentId));
    if (already) {
      console.log('[webhook] payment ya emitido:', paymentId);
      return res.status(200).send('OK');
    }

    // Construir el ticket a partir de metadata que envías desde el frontend
    // (Si no enviaste metadata, rellenamos con valores básicos)
    const meta = payment?.metadata || {};
    const buyer_name = `${payment?.payer?.first_name || ''} ${payment?.payer?.last_name || ''}`.trim() || meta.buyer_name || '—';
    const buyer_email = payment?.payer?.email || meta.buyer_email || '';
    const function_id = meta.function_id || 'funcion-1';
    const function_label = meta.function_label || 'Función';
    const event_title = process.env.EVENT_TITLE || 'Evento';
    const currency = payment?.currency_id || process.env.CURRENCY || 'MXN';
    const amount = Number(payment?.transaction_amount || meta.price || process.env.PRICE_GENERAL || 0) || 0;

    // Generar ticket
    const ticketId = uuidv4();
    insertTicket({
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
    });

    // Disparar emisión (PDF + correo)
    // NOTA: reusamos tu endpoint interno para no duplicar lógica
    const origin = process.env.BASE_URL;
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
      }),
    });
    console.log('[webhook] issue tickets ->', issueRes.status);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] ERROR:', err?.message || err);
    return res.status(200).send('OK');
  }
});

// Compatibilidad con /pagos/webhook (por si MP llama a la ruta en español)
router.post('/pagos/webhook', (req, res, next) => {
  req.url = '/webhook';
  next();
});

export default router;
