// Soporte robusto para distintas variantes del SDK de Mercado Pago (v1 y v2)
import * as mp from 'mercadopago';

let mode = null;           // 'v2' | 'v1'
let v2 = { MercadoPagoConfig: null, Preference: null };
let v1 = { configure: null, configurations: null, preferences: null };
let mpClient = null;

function resolveSDK() {
  // Intenta obtener clases v2 desde named o desde default
  v2.MercadoPagoConfig =
    mp.MercadoPagoConfig || mp.default?.MercadoPagoConfig || null;
  v2.Preference =
    mp.Preference || mp.default?.Preference || null;

  // API v1 (legacy)
  v1.configure = typeof mp.configure === 'function' ? mp.configure : (mp.default?.configure || null);
  v1.configurations = mp.configurations || mp.default?.configurations || null;
  v1.preferences = mp.preferences || mp.default?.preferences || null;
}

export function initMP() {
  resolveSDK();
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.warn('[mercadoPago] MP_ACCESS_TOKEN no definido');
  }

  // SDK v2 (clases)
  if (v2.MercadoPagoConfig && v2.Preference) {
    mpClient = new v2.MercadoPagoConfig({ accessToken: token });
    mode = 'v2';
    console.log('[mercadoPago] Usando SDK v2 (MercadoPagoConfig + Preference)');
    return;
  }

  // SDK v1 (legacy)
  if (v1.preferences && (v1.configurations?.setAccessToken || v1.configure)) {
    if (v1.configurations?.setAccessToken) {
      v1.configurations.setAccessToken(token);
      console.log('[mercadoPago] v1: configurations.setAccessToken OK');
    } else if (v1.configure) {
      v1.configure({ access_token: token });
      console.log('[mercadoPago] v1: configure OK');
    }
    mode = 'v1';
    return;
  }

  // Si no caímos en ninguno, error claro
  throw new Error('[mercadoPago] SDK no compatible: no hay v2 (MercadoPagoConfig/Preference) ni v1 (preferences + configure/configurations)');
}

/**
 * Crea una preferencia de Checkout Pro
 * - En v2: new Preference(client).create({ body })
 * - En v1: mercadopago.preferences.create(body)
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

  if (mode === 'v2') {
    if (!mpClient) {
      throw new Error('[mercadoPago] v2: mpClient no inicializado (llama initMP primero).');
    }
    const preference = new v2.Preference(mpClient);
    const resp = await preference.create({ body });
    return resp; // v2 devuelve objeto directo (incluye id, init_point, sandbox_init_point)
  }

  if (mode === 'v1') {
    const pref = await v1.preferences.create(body);
    // v1 suele devolver { body: {...} }
    return pref.body || pref;
  }

  throw new Error('[mercadoPago] SDK no inicializado. Llama initMP() primero.');
}
