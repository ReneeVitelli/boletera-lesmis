// backend/src/db.js
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH || "/var/data/tickets.db";

let _db = null;

export function getDB() {
  if (_db) return _db;
  // Asegura carpeta
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  return _db;
}

function columnExists(db, table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === column);
}

function ensureColumn(db, table, column, ddl) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Crea tablas base si no existen y aplica migraciones idempotentes
 * (no rompe datos existentes).
 */
export async function initSchema() {
  const db = getDB();

  // Tabla tickets (si no existe)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      buyer_name TEXT,
      buyer_email TEXT,
      status TEXT DEFAULT 'vigente',
      price_cents INTEGER DEFAULT 0,
      created_at INTEGER,
      used_at INTEGER
    );
  `);

  // ---- Migraciones idempotentes ----
  // 1) show_title: título de la obra (usado por el render del boleto)
  ensureColumn(db, "tickets", "show_title", `TEXT DEFAULT 'Los Miserables'`);

  // 2) function_label: texto “Función Admin — Sáb 6 Dic 18:00” (si lo usa tu app)
  ensureColumn(db, "tickets", "function_label", `TEXT`);

  // 3) alumno_code: código del alumno que ahora mostramos en el boleto
  ensureColumn(db, "tickets", "alumno_code", `TEXT`);

  // (Agrega aquí futuros ensureColumn(...) sin miedo: son seguros)

  // Índices útiles (idempotentes)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_buyer_email ON tickets(buyer_email);
  `);

  return db;
}
