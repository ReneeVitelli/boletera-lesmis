import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

// Asegura carpeta de datos
fs.mkdirSync(DATA_DIR, { recursive: true });

// Abre DB
const db = new Database(DB_PATH);

// Esquema mínimo
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

  CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
  CREATE INDEX IF NOT EXISTS idx_tickets_payment ON tickets(payment_id);
`);

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

/** (Opcional) Inserta un ticket – por si en algún sitio lo necesitas */
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

// Export por defecto del handle de DB (por compatibilidad con otros módulos)
export default db;
