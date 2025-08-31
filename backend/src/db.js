import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'tickets.db');

// Asegura carpeta
fs.mkdirSync(DATA_DIR, { recursive: true });

// Abre DB (modo sin WAL para discos pequeños; si quieres WAL, descomenta más abajo)
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

// Si más adelante quieres rendimiento y atomicidad extra en disco persistente:
// db.pragma('journal_mode = WAL');

export default db;
