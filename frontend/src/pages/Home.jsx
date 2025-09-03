import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Les Misérables — Funciones</h1>
      <p>Haz clic para ir a la compra.</p>
      <p><Link to="/comprar">Ir a /comprar</Link></p>
    </main>
  );
}
