import { Router } from 'express';
import { createPreference } from '../mercadoPago.js';
import { issueTickets } from '../tickets.js';
import fetch from 'node-fetch';

const router = Router();

// --- Crear preferencia (Checkout Pro)
router.post('/preference', async (req, res) => {
  try {
    const { title, quantity, price, currency, success_url, failure_url, pending_url, metadata } = req.body || {};

    const back_urls = {
      success: success_url || 'https://example.org/ok',
      failure: failure_url || success_url || 'https://example.org/ok',
      pending: pending_url || success_url || 'https://example.org/ok',
    };

    const resp = await createPreference({
      title: title || 'Boleto',
      quantity: Number(quantity || 1),
      unit_price: Number(price || 0),
      currency_id: currency || 'MXN',
      back_urls,
      auto_return: 'approved',
      notification_url: `${process.env.BASE_URL}/api/payments/webhook`,
      metadata: metadata || {},
    });

    return res.json({
      id: resp.id,
      init_point: resp.init_point,
      sandbox_init_point: resp.sandbox_init_point,
      back_urls: resp.back_urls,
    });
  } catch (err) {
    console.error('[preferencia] ERROR:', err?.message || err);
    return res.status(500).json({ error: 'preference_failed', details: String(err?.message || err) });
  }
});

// --- Webhook de Mercado Pago
router.post('/webhook', async (req, res) => {
  try {
    const query = req.query;
    const body = req.body;

    console.log('[webhook] query:', query);
    console.log('[webhook] body:', body);

    // Determinar paymentId
    let paymentId = null;
    if (query['data.id']) paymentId = query['data.id'];
    if (query.id && query.topic === 'payment') paymentId = query.id;
    if (body?.data?.id) paymentId = body.data.id;

    if (!paymentId) {
      console.log('[webhook] sin paymentId o no es de tipo payment.', 'type=', query?.topic || body?.type, ' paymentId=', paymentId);
      return res.status(200).send('OK');
    }

    // Consultar pago
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const mpResp = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const mpData = await mpResp.json();

    if (mpData?.status === 'approved') {
      console.log('[webhook] payment.id=', paymentId, 'status=', mpData.status);

      try {
        await issueTickets({
          payment_id: paymentId, // 🔑 ahora lo pasamos al insert
          buyer_name: mpData.payer?.first_name || '',
          buyer_email: mpData.payer?.email || '',
          buyer_phone: mpData.payer?.phone?.number || '',
          quantity: mpData.additional_info?.items?.[0]?.quantity || 1,
          price: mpData.transaction_details?.total_paid_amount || 0,
          currency: mpData.currency_id || 'MXN',
          function_label: mpData.additional_info?.items?.[0]?.title || 'Función',
          event_title: process.env.EVENT_TITLE || 'Evento',
        });
      } catch (e) {
        if (String(e?.message || '').includes('SQLITE_CONSTRAINT')) {
          console.log('[webhook] duplicado ignorado');
        } else {
          console.error('[webhook] Error de inserción en la base de datos:', e);
        }
      }
    }
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] ERROR:', err?.message || err);
    return res.status(500).send('fail');
  }
});

export default router;
