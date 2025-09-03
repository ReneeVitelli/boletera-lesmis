import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Comprar from "./pages/Comprar.jsx";

export default function App() {
  return (
    <Router>
      <div>
        <header style={{ padding: "12px 16px", borderBottom: "1px solid #ddd" }}>
          <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Link to="/" style={{ fontWeight: 700, textDecoration: "none" }}>
              Los Miserables
            </Link>
            <span style={{ flex: 1 }} />
            <Link to="/" style={{ textDecoration: "none" }}>Inicio</Link>
            <Link to="/comprar" style={{ textDecoration: "none" }}>Comprar</Link>
          </nav>
        </header>

        <main style={{ minHeight: "60vh" }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/comprar" element={<Comprar />} />
          </Routes>
        </main>

        <footer style={{ padding: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#666" }}>
          © {new Date().getFullYear()} Boletera escolar – Los Miserables
        </footer>
      </div>
    </Router>
  );
}
