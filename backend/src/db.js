// backend/src/db.js
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/tmp/boletera-data'; // ← fallback escribible en Render
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'tickets.db');
const db = new Database(DB_PATH);

// Esquema con columnas actuales (incluye payment_id y updated_at)
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
    created_at TEXT,
    updated_at TEXT
  );
`);

// Prepared statements
const insertStmt = db.prepare(`
  INSERT INTO tickets (
    id, buyer_name, buyer_email, buyer_phone,
    function_id, function_label, event_title,
    currency, price, used, payment_id,
    created_at, updated_at
  ) VALUES (
    @id, @buyer_name, @buyer_email, @buyer_phone,
    @function_id, @function_label, @event_title,
    @currency, @price, @used, @payment_id,
    @created_at, @updated_at
  )
`);

const getStmt = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
const markUsedStmt = db.prepare(`
  UPDATE tickets
  SET used = 1, updated_at = @updated_at
  WHERE id = @id
`);

export function insertTicket(ticket) {
  return insertStmt.run(ticket);
}

export function getTicket(id) {
  return getStmt.get(id);
}

export function markUsed(id) {
  const res = markUsedStmt.run({ id, updated_at: new Date().toISOString() });
  return res.changes > 0;
}
