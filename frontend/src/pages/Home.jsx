import React from 'react';
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  // Lista base de funciones (puedes editar textos/fechas/precios)
  const funciones = useMemo(
    () => [
      {
        id: "funcion-1",
        label: "Función 1 - Jue 12 Sep 2025 19:00",
        price: 350,
      },
      {
        id: "funcion-2",
        label: "Función 2 - Vie 12 Sep 2025 19:00",
        price: 350,
      },
      {
        id: "funcion-3",
        label: "Función 3 - Sáb 13 Sep 2025 17:00",
        price: 350,
      },
      {
        id: "funcion-4",
        label: "Función 4 - Sáb 13 Sep 2025 20:00",
        price: 350,
      },
    ],
    []
  );

  function comprarEsta(funcion) {
    // OPCIONAL: guarda la selección para que Comprar.jsx la pueda leer si lo habilitamos
    try {
      sessionStorage.setItem("selectedFunction", JSON.stringify(funcion));
    } catch {}
    navigate("/comprar");
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <h1>Los Miserables</h1>
      <p>Elige la función a la que quieres asistir y compra tus boletos.</p>

      <div style={{ display: "grid", gap: 12 }}>
        {funciones.map((f) => (
          <div
            key={f.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{f.label}</div>
              <div style={{ color: "#555" }}>Precio: ${f.price} MXN</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => comprarEsta(f)}>Comprar esta función</button>
              <Link to="/comprar">
                <button>Ir a comprar</button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link to="/comprar">Ir a comprar (sin seleccionar)</Link>
      </div>
    </div>
  );
}
