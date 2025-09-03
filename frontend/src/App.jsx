import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Comprar from './pages/Comprar.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />}/>
        <Route path="/comprar" element={<Comprar />}/>
        {/* Catch-all para ver si hay rutas mal resueltas */}
        <Route path="*" element={
          <div style={{padding: 24, fontFamily: 'system-ui'}}>
            <h1>404</h1>
            <p>Ruta no encontrada</p>
            <p><Link to="/">Volver al inicio</Link></p>
          </div>
        }/>
      </Routes>
    </BrowserRouter>
  );
}
