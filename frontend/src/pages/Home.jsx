import React from 'react';
import { useNavigate } from 'react-router-dom';

function FunctionCard({ f, onBuy }){
  return (
    <div style={{background:'#fff',padding:16,borderRadius:12,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div>
        <div style={{fontWeight:600}}>{f.title}</div>
        <div style={{color:'#666'}}>{f.date} • {f.time}</div>
        <div style={{marginTop:6,fontWeight:700}}>${f.price} MXN</div>
      </div>
      <button onClick={onBuy} style={{padding:'8px 12px',borderRadius:10,background:'#000',color:'#fff'}}>Comprar</button>
    </div>
  );
}

export default function Home(){
  const nav = useNavigate();
  const funciones = [
    { id: 'funcion-1', title: 'Función 1 (Jue)', date: 'Jue 12 Sep 2025', time: '19:00', price: 150 },
    { id: 'funcion-2', title: 'Función 2 (Vie)', date: 'Vie 13 Sep 2025', time: '19:00', price: 150 },
    { id: 'funcion-3', title: 'Función 3 (Sáb)', date: 'Sáb 14 Sep 2025', time: '12:00', price: 150 },
    { id: 'funcion-4', title: 'Función 4 (Sáb)', date: 'Sáb 14 Sep 2025', time: '18:00', price: 150 },
  ];

  return (
    <div style={{maxWidth:800,margin:'0 auto'}}>
      <h1 style={{fontSize:22,fontWeight:700}}>Les Misérables – Funciones</h1>
      <div style={{marginTop:16}}>
        {funciones.map(f => (
          <FunctionCard key={f.id} f={f} onBuy={() => nav('/comprar', { state: f })} />
        ))}
      </div>
    </div>
  );
}
