import React from "react";

// Importa tus imágenes desde src/assets (ojo con la ruta relativa ../)
import banner from "../assets/banner.jpg";                // imagen principal en JPG
import cosette from "../assets/cosette.png";              // rostro Cosette
import postal from "../assets/postal.png";                // composición Miserables (opcional)
import postalRecortada from "../assets/postal_recortada.png"; // versión circular (opcional)
import barricada from "../assets/barricada.png";          // fondo barricada
import titulo from "../assets/titulo.png";                // título Los Miserables

const Home = () => {
  return (
    <div className="font-sans text-gray-900">
      {/* Banner */}
      <div className="relative w-full h-96">
        <img
          src={banner}
          alt="Banner Los Miserables"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black bg-opacity-40 flex flex-col items-center justify-center text-white">
          <img src={titulo} alt="Los Miserables" className="w-80 mb-4" />
          <p className="italic text-lg">
            “Amar, eso es lo único que puede colmar la eternidad”
          </p>
        </div>
      </div>

      {/* Información del evento */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold mb-1">Teatro Jorge Negrete</h2>
        <p className="text-sm text-gray-700 mb-6">
          Ignacio Manuel Altamirano 126, CDMX
        </p>

        <h3 className="text-xl font-semibold mb-3">Acerca del evento</h3>
        <p className="mb-6 leading-relaxed">
          Ambientada a principios del siglo XIX en Francia, <b>Los Miserables</b>,
          el musical, es una adaptación de la novela homónima de Victor Hugo,
          publicada en 1862. Cuenta la historia de Jean Valjean y su deseo de
          redención.
        </p>

        {/* Funciones */}
        <h3 className="text-xl font-semibold mb-4">
          Selecciona la función a la que deseas asistir:
        </h3>
        <ul className="space-y-2 mb-6">
          <li>📅 Sábado 1º de Noviembre, 16 h</li>
          <li>📅 Sábado 1º de Noviembre, 20 h</li>
          <li>📅 Domingo 2 de Noviembre, 16 h</li>
          <li>📅 Domingo 2 de Noviembre, 20 h</li>
        </ul>

        <p className="text-lg font-bold mb-6">🎟 Entrada General: $350.00 MXN</p>

        {/* Mapa */}
        <iframe
          className="w-full h-80 rounded-lg shadow-lg"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3762.5212408999517!2d-99.1636696!3d19.4348034!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85d1f8cb76015d31%3A0xd11f6e1a93237387!2sTeatro%20%22Jorge%20Negrete%22!5e0!3m2!1ses!2smx!4v1693692275032!5m2!1ses!2smx"
          allowFullScreen=""
          loading="lazy"
          title="Mapa Teatro Jorge Negrete"
        ></iframe>
      </div>

      {/* Decoración al final (puedes cambiar qué imágenes usar) */}
      <div className="flex justify-center gap-6 py-10 bg-gray-100">
        <img src={cosette} alt="Cosette" className="h-40" />
        <img src={barricada} alt="Barricada" className="h-40" />
        {/* <img src={postal} alt="Composición" className="h-40" /> */}
        {/* <img src={postalRecortada} alt="Composición circular" className="h-40 rounded-full" /> */}
      </div>
    </div>
  );
};

export default Home;
