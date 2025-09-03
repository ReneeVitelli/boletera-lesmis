// backend/src/db.js
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// --- Ruta de la base ---
const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'tickets.db');
const DB_PATH = (process.env.TICKETS_DB_PATH || DEFAULT_DB_PATH).trim();

// --- Asegura carpeta contenedora ---
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
console.log('[db] usando', path.relative(process.cwd(), DB_PATH));

// --- Abre conexión ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- Helpers ---
function columnExists(table, col) {
  const info = db.prepare(`PRAGMA table_info(${table});`).all();
  return info.some((r) => r.name === col);
}
function tableExists(table) {
  const r = db
    .prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1;`
    )
    .get(table);
  return !!r;
}

// --- Crea tabla si no existe (versión mínima, sin columnas nuevas) ---
if (!tableExists('tickets')) {
  db.exec(`
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      buyer_name   TEXT,
      buyer_email  TEXT,
      buyer_phone  TEXT,
      function_id  TEXT,
      function_label TEXT,
      event_title  TEXT,
      currency     TEXT,
      price        REAL,
      qr_url       TEXT,
      pdf_path     TEXT,
      used         INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
      -- columnas nuevas se añaden por ALTER más abajo
    );
  `);
  console.log('[db:init] creada tabla tickets (esquema base)');
}

// --- Migraciones idempotentes en orden SEGURO ---

// 1) updated_at
if (!columnExists('tickets', 'updated_at')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));`);
  console.log('[db:migrate] added column: updated_at');
}

// 2) payment_id
if (!columnExists('tickets', 'payment_id')) {
  db.exec(`ALTER TABLE tickets ADD COLUMN payment_id TEXT;`);
  console.log('[db:migrate] added column: payment_id');
}

// 3) índice único sobre payment_id (si existe la columna)
try {
  if (columnExists('tickets', 'payment_id')) {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_payment_id
      ON tickets(payment_id)
      WHERE payment_id IS NOT NULL;
    `);
    // No log ruidoso si ya existe
  }
} catch (e) {
  console.warn('[db:migrate] índice payment_id: ignorado:', e?.message || e);
}

// --- Statements preparados ---
const stmtInsert = db.prepare(`
  INSERT INTO tickets (
    id, buyer_name, buyer_email, buyer_phone,
    function_id, function_label, event_title,
    currency, price, qr_url, pdf_path, used,
    created_at, updated_at, payment_id
  ) VALUES (
    @id, @buyer_name, @buyer_email, @buyer_phone,
    @function_id, @function_label, @event_title,
    @currency, @price, @qr_url, @pdf_path, COALESCE(@used, 0),
    COALESCE(@created_at, datetime('now')),
    COALESCE(@updated_at, datetime('now')),
    @payment_id
  );
`);

const stmtGet = db.prepare(`SELECT * FROM tickets WHERE id = ?;`);
const stmtGetByPayment = db.prepare(`SELECT * FROM tickets WHERE payment_id = ?;`);
const stmtMarkUsed = db.prepare(`
  UPDATE tickets
     SET used = 1,
         updated_at = datetime('now')
   WHERE id = ?;
`);

// --- API ---
export function insertTicket(ticket) {
  // Idempotencia por payment_id
  if (ticket?.payment_id) {
    const existing = stmtGetByPayment.get(String(ticket.payment_id));
    if (existing) return existing;
  }
  stmtInsert.run({
    id: ticket.id,
    buyer_name: ticket.buyer_name || '',
    buyer_email: ticket.buyer_email || '',
    buyer_phone: ticket.buyer_phone || '',
    function_id: ticket.function_id || '',
    function_label: ticket.function_label || '',
    event_title: ticket.event_title || '',
    currency: ticket.currency || 'MXN',
    price: Number(ticket.price || 0),
    qr_url: ticket.qr_url || '',
    pdf_path: ticket.pdf_path || '',
    used: ticket.used ? 1 : 0,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    payment_id: ticket.payment_id ? String(ticket.payment_id) : null,
  });
  return stmtGet.get(ticket.id);
}

export function getTicket(id) {
  return stmtGet.get(id);
}

export function getTicketByPaymentId(paymentId) {
  return stmtGetByPayment.get(String(paymentId));
}

export function markUsed(id) {
  const r = stmtMarkUsed.run(id);
  return r.changes > 0;
}
