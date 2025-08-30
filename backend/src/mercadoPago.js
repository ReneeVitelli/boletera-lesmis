import mercadopago from 'mercadopago';

export function initMP() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.warn('[mercadoPago] MP_ACCESS_TOKEN no definido');
  }

  // SDK v2 (moderno) o fallback a v1 (legacy)
  if (mercadopago?.configurations?.setAccessToken) {
    mercadopago.configurations.setAccessToken(token);
    console.log('[mercadoPago] SDK v2: configurations.setAccessToken OK');
  } else if (typeof mercadopago?.configure === 'function') {
    mercadopago.configure({ access_token: token });
    console.log('[mercadoPago] SDK v1: configure OK');
  } else {
    throw new Error('[mercadoPago] SDK no compatible: ni configurations.setAccessToken ni configure disponibles');
  }
}

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
  const qty = Number(quantity || 1);
  const price = Number(unit_price || 0);

  const preference = {
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

  const pref = await mercadopago.preferences.create(preference);
  return pref.body ?? pref;
}
