// backend/src/db.js
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// 1) Carpeta base de datos (persistente en Render Starter+ con Disk)
//    - Si DATA_DIR está definida (Render: apúntala a /var/data/boletera-data)
//    - Si no, usa ./data localmente (desarrollo)
const DATA_DIR = process.env.DATA_DIR || './data';
fs.mkdirSync(DATA_DIR, { recursive: true });

// 2) Ruta del archivo SQLite
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

// Log útil para diagnóstico
console.log('[db] usando', DB_PATH);

// 3) Abre DB
const db = new Database(DB_PATH);

// 4) Migraciones mínimas
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    function_id TEXT,
    function_label TEXT,
    event_title TEXT,
    currency TEXT,
    price REAL,
    used INTEGER DEFAULT 0,
    payment_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_payment ON tickets(payment_id);
`);

// 5) Helpers
export function insertTicket(t) {
  const stmt = db.prepare(`
    INSERT INTO tickets (
      id, buyer_name, buyer_email, buyer_phone,
      function_id, function_label, event_title,
      currency, price, used, payment_id, created_at, updated_at
    ) VALUES (
      @id, @buyer_name, @buyer_email, @buyer_phone,
      @function_id, @function_label, @event_title,
      @currency, @price, 0, @payment_id, datetime('now'), datetime('now')
    )
  `);
  return stmt.run(t);
}

export function getTicket(id) {
  const stmt = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
  return stmt.get(id);
}

export function markUsed(id) {
  const stmt = db.prepare(`
    UPDATE tickets
       SET used = 1,
           updated_at = datetime('now')
     WHERE id = ?
  `);
  return stmt.run(id);
}

export default db;
