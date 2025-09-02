// backend/src/db.js
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || '/var/data/tickets.db';

// Asegura carpeta
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Abre DB
const db = new Database(DB_PATH);

// Crea tabla base si no existe
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
    used INTEGER DEFAULT 0
  );
`);

// --- Migraciones seguras (añade columnas si faltan) ---
function ensureColumns(table, defs) {
  const cols = db.prepare(`PRAGMA table_info(${table});`).all();
  const have = new Set(cols.map(c => c.name));
  for (const def of defs) {
    if (!have.has(def.name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${def.name} ${def.type}${def.default ?? ''};`);
    }
  }
}

// Añadimos columnas nuevas si faltan
ensureColumns('tickets', [
  { name: 'payment_id', type: 'TEXT' },
  { name: 'pdf_path',   type: 'TEXT' },
  { name: 'created_at', type: 'TEXT' },
  { name: 'updated_at', type: 'TEXT' },
]);

// --- Helpers preparados ---
const insertStmt = db.prepare(`
  INSERT INTO tickets (
    id, buyer_name, buyer_email, buyer_phone,
    function_id, function_label, event_title,
    currency, price, used, payment_id, pdf_path,
    created_at, updated_at
  ) VALUES (
    @id, @buyer_name, @buyer_email, @buyer_phone,
    @function_id, @function_label, @event_title,
    @currency, @price, @used, @payment_id, @pdf_path,
    @created_at, @updated_at
  );
`);

const getStmt = db.prepare(`SELECT * FROM tickets WHERE id = ?;`);

const markUsedStmt = db.prepare(`
  UPDATE tickets
     SET used = 1,
         updated_at = @updated_at
   WHERE id = @id;
`);

const recentStmt = db.prepare(`
  SELECT * FROM tickets
   ORDER BY datetime(created_at) DESC
   LIMIT ?;
`);

// --- API ---
export function insertTicket(ticket) {
  const now = new Date().toISOString();
  const row = {
    id: ticket.id,
    buyer_name: ticket.buyer_name ?? '—',
    buyer_email: ticket.buyer_email ?? '',
    buyer_phone: ticket.buyer_phone ?? '',
    function_id: ticket.function_id ?? '',
    function_label: ticket.function_label ?? '',
    event_title: ticket.event_title ?? (process.env.EVENT_TITLE || 'Evento'),
    currency: ticket.currency ?? (process.env.CURRENCY || 'MXN'),
    price: Number(ticket.price ?? 0),
    used: Number(ticket.used ?? 0),
    payment_id: ticket.payment_id ? String(ticket.payment_id) : null,
    pdf_path: ticket.pdf_path ?? null,
    created_at: ticket.created_at ?? now,
    updated_at: ticket.updated_at ?? now,
  };
  insertStmt.run(row);
  return row.id;
}

export function getTicket(id) {
  return getStmt.get(id);
}

export function markUsed(id) {
  return markUsedStmt.run({ id, updated_at: new Date().toISOString() }).changes > 0;
}

export function listRecent(limit = 20) {
  return recentStmt.all(limit);
}
