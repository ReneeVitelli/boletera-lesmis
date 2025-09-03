import React, { useState, useMemo } from 'react';

// Lee el backend desde la variable de Netlify y quita la barra final si la hubiera
const API_BASE = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

// URL de tu sitio en Netlify (para back_urls)
const FRONT_ORIGIN = 'https://los-miserables.netlify.app';

// Precio y función (puedes ajustar aquí o en envs más adelante)
const PRICE = 150;
const CURRENCY = 'MXN';
const FUNCTION_ID = 'funcion-1';
const FUNCTION_LABEL = 'Función 1 (Jue)';

export default function Comprar() {
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState('');
  const [lastPrefId, setLastPrefId] = useState('');

  // construimos una función que pega al backend correcto
  const createPrefUrl = useMemo(() => `${API_BASE}/api/payments/preference`, []);

  async function handlePay() {
    try {
      setLoading(true);
      setLastError('');
      setLastPrefId('');

      if (!API_BASE) {
        throw new Error('No está configurado VITE_BACKEND_URL');
      }

      const back_urls = {
        success: `${FRONT_ORIGIN}/?ok=1`,
        failure: `${FRONT_ORIGIN}/?ok=0`,
        pending: `${FRONT_ORIGIN}/?ok=2`,
      };

      const payload = {
        title: `Boleto - ${FUNCTION_LABEL}`,
        quantity: 1,
        price: PRICE,
        currency: CURRENCY,
        back_urls,
        // Puedes pasar datos adicionales para el webhook (se guardan en payment.metadata)
        metadata: {
          function_id: FUNCTION_ID,
          function_label: FUNCTION_LABEL,
          // buyer_name, buyer_email se pueden completar luego desde un pequeño form
        },
      };

      const res = await fetch(createPrefUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} ${txt}`);
      }

      const data = await res.json();
      setLastPrefId(data.id || '');

      // En sandbox usa sandbox_init_point; en producción usa init_point
      const url = data.sandbox_init_point || data.init_point;
      if (!url) {
        throw new Error('El backend no devolvió init_point/sandbox_init_point');
      }

      // Redirige al checkout de Mercado Pago
      window.location.href = url;
    } catch (err) {
      console.error('[Comprar] error creando preferencia:', err);
      setLastError(String(err?.message || err));
      alert('Error creando preferencia');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Comprar</h1>

      <p>Precio general: <strong>${PRICE} {CURRENCY}</strong></p>
      <p>Función: <strong>{FUNCTION_LABEL}</strong></p>

      <button
        onClick={handlePay}
        disabled={loading}
        style={{
          padding: '0.9rem 1.2rem',
          fontSize: '1rem',
          borderRadius: 8,
          background: '#111',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Creando preferencia…' : `Pagar $${PRICE} ${CURRENCY} (sandbox)`}
      </button>

      <div style={{ marginTop: '1rem' }}>
        <small style={{ color: '#666' }}>
          Backend: <code>{API_BASE}</code>
        </small>
      </div>

      {lastPrefId && (
        <div style={{ marginTop: '0.75rem', color: '#0a0' }}>
          <small>Pref ID: {lastPrefId}</small>
        </div>
      )}
      {lastError && (
        <div style={{ marginTop: '0.75rem', color: '#c00' }}>
          <small>Error: {lastError}</small>
        </div>
      )}
    </main>
  );
}
