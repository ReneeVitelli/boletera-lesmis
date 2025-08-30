import { useState } from "react";

export default function Comprar() {
  const [loading, setLoading] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState({
    id: "funcion-1",
    label: "Función 1 - Jue 12 Sep 2025 19:00",
    price: 350,
  });

  async function handlePay() {
    try {
      setLoading(true);

      const resp = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/payments/preference`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: selectedFunction?.label || "Boleto",
            quantity: 1,
            price: selectedFunction?.price || 350,
            currency: "MXN",
            success_url: window.location.origin + "/?ok=1",
            metadata: {
              function_id: selectedFunction?.id,
              function_label: selectedFunction?.label,
              buyer_name: "Prueba Frontend",
              buyer_email: "prueba@example.com",
            },
          }),
        }
      );

      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${text}`);
      const pref = JSON.parse(text);

      // Redirige a sandbox o checkout normal
      window.location.href = pref.sandbox_init_point || pref.init_point;
    } catch (e) {
      console.error("[pref] error:", e);
      alert(`Error creando preferencia:\n${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Comprar boleto</h2>
      <p>{selectedFunction.label}</p>
      <p>Precio: {selectedFunction.price} MXN</p>

      <button onClick={handlePay} disabled={loading}>
        {loading ? "Procesando..." : `Pagar $${selectedFunction.price} MXN (sandbox)`}
      </button>
    </div>
  );
}
