// backend/src/db.js
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DEFAULT_DB_PATH = path.resolve('data', 'tickets.db');

/**
 * Resuelve la ruta final del .db:
 * - Usa TICKETS_DB_PATH si viene en env
 * - Si apunta a un directorio, agrega tickets.db
 * - Crea el directorio si no existe
 */
function resolveDbPath() {
  let p = process.env.TICKETS_DB_PATH || DEFAULT_DB_PATH;

  try {
    const stat = fs.existsSync(p) ? fs.statSync(p) : null;
    if (stat?.isDirectory()) {
      p = path.join(p, 'tickets.db');
    }
  } catch (_) {}

  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return p;
}

const DB_PATH = resolveDbPath();
const db = new Database(DB_PATH, { fileMustExist: false });

/** Crea tabla tickets si no existe, índices y trigger (todo en un solo exec). */
function createBase() {
  const sql = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  buyer_name     TEXT NOT NULL,
  buyer_email    TEXT NOT NULL,
  buyer_phone    TEXT,
  function_id    TEXT NOT NULL,
  function_label TEXT NOT NULL,
  event_title    TEXT NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'MXN',
  price          INTEGER NOT NULL DEFAULT 0,
  payment_id     TEXT UNIQUE,     -- nulo si emisión directa
  used           INTEGER NOT NULL DEFAULT 0,
  student_code   TEXT,            -- código del alumno
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_payment_id ON tickets(payment_id);

-- Trigger para mantener updated_at
CREATE TRIGGER IF NOT EXISTS trg_tickets_updated_at
AFTER UPDATE ON tickets
FOR EACH ROW
BEGIN
  UPDATE tickets SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`;
  // Ejecuta TODO el bloque de una vez para no romper el trigger
  db.exec(sql);
}

/** Devuelve true si una columna existe en la tabla. */
function hasColumn(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table});`).all();
  return info.some(c => c.name === column);
}

/** Migra columnas/índices faltantes sin romper datos existentes. */
function migrateColumns() {
  if (!hasColumn('tickets', 'payment_id')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN payment_id TEXT UNIQUE;`);
  }
  if (!hasColumn('tickets', 'used')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN used INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!hasColumn('tickets', 'updated_at')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN updated_at TEXT;`);
  }
  if (!hasColumn('tickets', 'student_code')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN student_code TEXT;`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_payment_id ON tickets(payment_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);`);

  const triggers = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_tickets_updated_at';`
  ).all();
  if (triggers.length === 0) {
    db.exec(`
CREATE TRIGGER trg_tickets_updated_at
AFTER UPDATE ON tickets
FOR EACH ROW
BEGIN
  UPDATE tickets SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`);
  }
}

/** Inicializa esquema: crea base y migra si hace falta. */
function initSchema() {
  // transacción por seguridad
  db.exec('BEGIN');
  try {
    createBase();
    migrateColumns();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Inserta ticket; si llega payment_id y ya existe, no duplica (idempotencia webhook). */
function insertTicket({
  id,
  buyer_name,
  buyer_email,
  buyer_phone = '',
  function_id,
  function_label,
  event_title,
  currency = 'MXN',
  price = 0,
  payment_id = null,
  student_code = null, // NUEVO
}) {
  // Si viene payment_id, evitamos duplicar
  if (payment_id) {
    const exists = db
      .prepare('SELECT id FROM tickets WHERE payment_id = ? LIMIT 1')
      .get(payment_id);
    if (exists?.id) return exists.id;
  }

  const stmt = db.prepare(`
INSERT INTO tickets (
  id, buyer_name, buyer_email, buyer_phone,
  function_id, function_label, event_title,
  currency, price, payment_id, used, student_code, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
`);

  stmt.run(
    id,
    buyer_name,
    buyer_email,
    buyer_phone,
    function_id,
    function_label,
    event_title,
    currency,
    Number(price) || 0,
    payment_id || null,
    student_code || null
  );

  return id;
}

/** Obtiene un ticket por id. */
function getTicket(id) {
  const row = db
    .prepare('SELECT * FROM tickets WHERE id = ? LIMIT 1')
    .get(id);
  return row || null;
}

/** Marca como usado (idempotente: no falla si ya estaba usado). */
function markUsed(id) {
  const res = db
    .prepare('UPDATE tickets SET used = 1 WHERE id = ?')
    .run(id);
  return res.changes > 0;
}

// Inicializa al cargar el módulo
initSchema();

export { insertTicket, getTicket, markUsed };
export default db;
