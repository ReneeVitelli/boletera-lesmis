import mercadopago from 'mercadopago';

export function initMP() {
  // SDK v2: setAccessToken
  mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);
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
  // Fuerza números
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
    metadata, // útil si envías function_id, buyer_name, etc. desde el frontend
  };

  const pref = await mercadopago.preferences.create(preference);
  return pref.body;
}
