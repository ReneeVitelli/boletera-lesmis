import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

function getClient() {
  const { MP_ACCESS_TOKEN } = process.env;
  if (!MP_ACCESS_TOKEN) {
    throw new Error('Falta MP_ACCESS_TOKEN en .env');
  }
  return new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
}

/**
 * Crea una preferencia de pago de Checkout Pro
 * title: string
 * quantity: number
 * price: number
 * currency: 'MXN' | ...
 * backUrls: { success: string, failure: string, pending: string }
 * metadata: object (opcional; ej. function_id, function_label)
 */
export async function createPreference({ title, quantity, price, currency, backUrls, metadata }) {
  const client = getClient();
  const preference = new Preference(client);

  const baseUrl = process.env.BASE_URL; // debe ser https://<tu-ngrok>.ngrok-free.app

  const res = await preference.create({
    body: {
      items: [
        {
          title,
          quantity,
          currency_id: currency,
          unit_price: Number(price)
        }
      ],

      // 👇 MUY IMPORTANTE: así nos aseguramos de recibir el webhook por preferencia
      notification_url: `${baseUrl}/api/payments/webhook`,

      // URLs para redirección (el backend ya valida/forza https cuando haga falta)
      back_urls: backUrls,

      // Datos adicionales (ej. function_id para saber qué función compró)
      metadata
    }
  });

  // La respuesta incluye init_point y sandbox_init_point
  return res;
}

/**
 * Obtiene un pago por id
 */
export async function getPayment(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  const res = await payment.get({ id: paymentId });
  return res;
}
