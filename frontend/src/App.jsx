import React from 'react';
import { Outlet, Link } from 'react-router-dom';

export default function App(){
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold">Boletera – Les Misérables</Link>
        <nav className="flex gap-4">
          <Link to="/comprar" className="hover:underline">Comprar</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <Outlet />
      </main>
      <footer className="text-center text-sm py-8 text-gray-500">© {new Date().getFullYear()} Taller de Teatro</footer>
    </div>
  );
}
