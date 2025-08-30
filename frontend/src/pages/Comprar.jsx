import React from 'react';
import { Link } from 'react-router-dom';

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://boletera-backend.onrender.com';

async function handlePay() {
  try {
    const payload = {
      title: 'Función 1 (Jue)',
      quantity: 1,
      price: 150,
      currency: 'MXN',
      success_url: 'https://los-miserables.netlify.app/?ok=1',
    };

    const resp = await fetch(`${API_BASE}/api/payments/preference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      let msg = 'Error creando preferencia';
      try {
        const err = await resp.json();
        msg = err?.details || err?.error || msg;
      } catch {}
      alert(msg);
      return;
    }

    const data = await resp.json();
    const url = data.sandbox_init_point || data.init_point;
    if (!url) {
      alert('No se recibió init_point de Mercado Pago.');
      console.error('Respuesta sin init_point:', data);
      return;
    }

    window.location.href = url; // redirige al checkout
  } catch (e) {
    console.error(e);
    alert('Error creando preferencia');
  }
}

export default function Comprar() {
  return (
    <div style={{ padding: 24, maxWidth: 620 }}>
      <p>
        <Link to="/">Boletera – Les Misérables</Link>
      </p>
      <h1>Función 1 (Jue)</h1>
      <p>Al hacer clic irás al checkout de Mercado Pago (sandbox).</p>

      <button
        onClick={handlePay}
        style={{
          background: '#000',
          color: '#fff',
          border: 'none',
          padding: '12px 18px',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Pagar $150 MXN (sandbox)
      </button>

      <p style={{ marginTop: 24 }}>© 2025 Taller de Teatro</p>
    </div>
  );
}
