// SDK v2 (clases)
import MercadoPagoConfig, { Preference } from 'mercadopago';

let mpClient = null;

export function initMP() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.warn('[mercadoPago] MP_ACCESS_TOKEN no definido');
  }
  // Crea el cliente v2
  mpClient = new MercadoPagoConfig({ accessToken: token });
  console.log('[mercadoPago] SDK v2 inicializado con MercadoPagoConfig');
}

/**
 * Crea una preferencia de Checkout Pro usando la SDK v2
 */
export async function createPreference({
  title,
  quantity,
  unit_price,
  currency_id,
  back_urls,
  auto_return = 'approved',
  notification_url,
  metadata = {},
}) {
  if (!mpClient) {
    throw new Error('[mercadoPago] mpClient no inicializado. Llama initMP() primero.');
  }

  const qty = Number(quantity || 1);
  const price = Number(unit_price || 0);

  const body = {
    items: [
      {
        title: title || 'Boleto',
        quantity: Number.isFinite(qty) ? qty : 1,
        unit_price: Number.isFinite(price) ? price : 0,
        currency_id: currency_id || 'MXN',
      },
    ],
    back_urls: back_urls || {
      success: 'https://example.org/ok',
      failure: 'https://example.org/ok',
      pending: 'https://example.org/ok',
    },
    auto_return,
    notification_url,
    metadata,
  };

  const preference = new Preference(mpClient);
  // En v2 se usa { body: ... }
  const resp = await preference.create({ body });
  // La v2 devuelve el objeto directamente (sin .body)
  return resp;
}
