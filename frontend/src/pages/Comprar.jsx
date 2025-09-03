import React from 'react';
import { useState } from "react";

export default function Comprar() {
  // Cargar función seleccionada desde Home (si existe)
  const [selectedFunction, setSelectedFunction] = useState(() => {
    try {
      const raw = sessionStorage.getItem("selectedFunction");
      if (raw) return JSON.parse(raw);
    } catch {}
    // valor por defecto si no se seleccionó nada antes
    return {
      id: "funcion-1",
      label: "Función 1 - Jue 12 Sep 2025 19:00",
      price: 350,
    };
  });

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");

  const [loading, setLoading] = useState(false);

  async function handlePay() {
    try {
      setLoading(true);
      const backend = import.meta.env.VITE_BACKEND_URL;

      const body = {
        title: selectedFunction.label,
        quantity: 1,
        price: selectedFunction.price,
        currency: "MXN",
        success_url: "https://los-miserables.netlify.app/?ok=1",
        metadata: {
          function_id: selectedFunction.id,
          function_label: selectedFunction.label,
          buyer_name: buyerName,
          buyer_email: buyerEmail,
          buyer_phone: buyerPhone,
        },
      };

      const res = await fetch(`${backend}/api/payments/preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.init_point) {
        throw new Error(data.error || "Error creando preferencia");
      }

      // Redirigir a Mercado Pago
      window.location.href = data.sandbox_init_point || data.init_point;
    } catch (err) {
      alert("Error creando preferencia: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <h1>Comprar boletos</h1>

      <div style={{ marginBottom: 16 }}>
        <label>
          Nombre completo <br />
          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          Correo electrónico <br />
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          Teléfono <br />
          <input
            type="text"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3>Función seleccionada:</h3>
        <p>
          {selectedFunction.label} — ${selectedFunction.price} MXN
        </p>
      </div>

      <button onClick={handlePay} disabled={loading}>
        {loading ? "Procesando..." : `Pagar $${selectedFunction.price} MXN`}
      </button>
    </div>
  );
}
