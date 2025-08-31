import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

/**
 * Crea la tabla si no existe (no modifica esquemas existentes).
 * Si la tabla ya existía con menos columnas, luego migramos con ALTER TABLE.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    buyer_name TEXT,
    buyer_email TEXT NOT NULL,
    buyer_phone TEXT,
    function_id TEXT,
    function_label TEXT,
    event_title TEXT,
    currency TEXT,
    price REAL,
    payment_id TEXT,
    used INTEGER DEFAULT 0
  );
`);

/** ===== MIGRACIÓN DE ESQUEMA (agrega columnas que falten) ===== */
(function migrate() {
  const rows = db.prepare(`PRAGMA table_info(tickets)`).all();
  const has = (name) => rows.some(r => r.name === name);

  const addColumn = (sql) => db.exec(sql);

  // Lista de columnas esperadas (con sus ALTER TABLE)
  const needed = [
    { name: 'buyer_phone', sql: `ALTER TABLE tickets ADD COLUMN buyer_phone TEXT;` },
    { name: 'function_id', sql: `ALTER TABLE tickets ADD COLUMN function_id TEXT;` },
    { name: 'function_label', sql: `ALTER TABLE tickets ADD COLUMN function_label TEXT;` },
    { name: 'event_title', sql: `ALTER TABLE tickets ADD COLUMN event_title TEXT;` },
    { name: 'currency', sql: `ALTER TABLE tickets ADD COLUMN currency TEXT;` },
    { name: 'price', sql: `ALTER TABLE tickets ADD COLUMN price REAL;` },
    { name: 'payment_id', sql: `ALTER TABLE tickets ADD COLUMN payment_id TEXT;` },
    { name: 'used', sql: `ALTER TABLE tickets ADD COLUMN used INTEGER DEFAULT 0;` },
  ];

  for (const col of needed) {
    if (!has(col.name)) addColumn(col.sql);
  }

  // Índices (ya con columnas presentes)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
    CREATE INDEX IF NOT EXISTS idx_tickets_payment ON tickets(payment_id);
  `);
})();

/** =========================
 *  Helpers usados por app.js
 *  ========================= */

/** Obtiene un ticket por id (o null si no existe) */
export function getTicket(id) {
  const stmt = db.prepare(
    `SELECT id, buyer_name, buyer_email, buyer_phone, function_id, function_label,
            event_title, currency, price, payment_id, used
     FROM tickets WHERE id = ?`
  );
  return stmt.get(id) || null;
}

/** Marca un ticket como usado. Devuelve true si cambió algo. */
export function markUsed(id) {
  const stmt = db.prepare('UPDATE tickets SET used = 1 WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/** Inserta un ticket (utilidad) */
export function insertTicket(t) {
  const stmt = db.prepare(
    `INSERT INTO tickets
     (id, buyer_name, buyer_email, buyer_phone, function_id, function_label,
      event_title, currency, price, payment_id, used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  return stmt.run(
    t.id, t.buyer_name, t.buyer_email, t.buyer_phone, t.function_id, t.function_label,
    t.event_title, t.currency, t.price, t.payment_id || null, t.used ? 1 : 0
  );
}

// Export default para compatibilidad
export default db;
