// backend/src/db.js
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/var/data";
const DB_PATH  = process.env.DB_PATH  || path.join(DATA_DIR, "tickets.db");

let dbInstance = null;

/**
 * Devuelve la conexión singleton. Debes llamar antes a initSchema().
 */
export function getDB() {
  if (!dbInstance) {
    throw new Error("DB no inicializada. Llama primero a initSchema().");
  }
  return dbInstance;
}

/**
 * Abre la BD y garantiza el esquema base. Es idempotente.
 */
export async function initSchema() {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma("journal_mode = WAL");
  }

  const execMany = (sql) => dbInstance.exec(sql);

  // Esquema mínimo y seguro (no rompe si ya existe).
  execMany(`
    CREATE TABLE IF NOT EXISTS tickets (
      id           TEXT PRIMARY KEY,
      title        TEXT,             -- "Los Miserables"
      show_label   TEXT,             -- "Función Admin — Sáb 6 Dic 18:00"
      show_date    TEXT,             -- ISO si lo necesitas
      buyer_name   TEXT,
      buyer_email  TEXT,
      buyer_phone  TEXT,
      alumno_code  TEXT,             -- aquí guardamos el código (ALU-12345 o 555...)
      price_cents  INTEGER,          -- opcional
      used         INTEGER DEFAULT 0, -- 0/1
      issued_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
  `);

  return dbInstance;
}
