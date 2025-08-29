import React from 'react';
import { useLocation } from 'react-router-dom';

export default function Comprar(){
  const { state } = useLocation();

  async function crearPreferencia(){
    if (!state) return;
    const payload = {
      title: state.title,
      quantity: 1,
      price: state.price,
      currency: 'MXN',
      success_url: window.location.origin + '/?ok=1'
    };
    const res = await fetch((import.meta.env.VITE_API_BASE || 'http://localhost:8080') + '/api/payments/preference', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok){
      const url = data.preference.init_point || data.preference.sandbox_init_point;
      window.open(url, '_blank');
    } else {
      alert('Error creando preferencia');
    }
  }

  if (!state) return <p>Selecciona una función desde la portada.</p>;

  return (
    <div style={{maxWidth:600,margin:'0 auto',background:'#fff',padding:20,borderRadius:12}}>
      <h2 style={{fontSize:18,fontWeight:700}}>{state.title}</h2>
      <p style={{color:'#666'}}>Al hacer clic irás al checkout de Mercado Pago (sandbox).</p>
      <button onClick={crearPreferencia} style={{padding:'10px 14px',borderRadius:10,background:'#000',color:'#fff'}}>Pagar ${state.price} MXN (sandbox)</button>
    </div>
  );
}
