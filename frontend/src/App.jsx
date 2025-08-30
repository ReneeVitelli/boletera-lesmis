import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Comprar from "./pages/Comprar.jsx";

export default function App() {
  return (
    <Router>
      <div>
        <nav style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
          <Link to="/" style={{ marginRight: "15px" }}>Inicio</Link>
          <Link to="/comprar">Comprar</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/comprar" element={<Comprar />} />
        </Routes>
      </div>
    </Router>
  );
}
