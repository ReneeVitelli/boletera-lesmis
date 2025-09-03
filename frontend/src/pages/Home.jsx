import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main style={{padding: 24, fontFamily: 'system-ui'}}>
      <h1>Los Miserables — Boletera</h1>
      <p>Inicio OK. Si ves esto, el router está vivo.</p>
      <p><Link to="/comprar">Ir a /comprar</Link></p>
    </main>
  );
}
