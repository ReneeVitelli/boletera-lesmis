import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.TICKETS_DB_PATH || path.resolve('./data/tickets.db');
const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath, { verbose: null });

// --- Migraciones / creación de tablas ---
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_function ON tickets(function_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(buyer_email);
`);

try {
  db.prepare('SELECT payment_id FROM tickets LIMIT 1').get();
} catch {
  db.exec(`ALTER TABLE tickets ADD COLUMN payment_id TEXT`);
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS ux_tickets_payment_id
  ON tickets(payment_id)
  WHERE payment_id IS NOT NULL
`);

/* 
  Tabla opcional de LOG de pagos.
  Algunas rutas/patches pueden intentar INSERT en "pagos".
  La dejamos creada para evitar errores y para auditar webhooks si quieres.
*/
db.exec(`
  CREATE TABLE IF NOT EXISTS pagos (
    id TEXT PRIMARY KEY,           -- payment_id de MP
    status TEXT,
    amount REAL,
    currency TEXT,
    email TEXT,
    raw TEXT,                      -- JSON del payload (string)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Helpers tickets ---
export function insertTicket(t) {
  const stmt = db.prepare(`
    INSERT INTO tickets (
      id, buyer_name, buyer_email, buyer_phone,
      function_id, function_label, event_title,
      currency, price, used, payment_id
    ) VALUES (
      @id, @buyer_name, @buyer_email, @buyer_phone,
      @function_id, @function_label, @event_title,
      @currency, @price, 0, @payment_id
    )
  `);
  return stmt.run(t);
}

export function getTicket(id) {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
}

export function getTicketByPaymentId(paymentId) {
  return db.prepare(`SELECT * FROM tickets WHERE payment_id = ?`).get(paymentId);
}

export function markUsed(id) {
  return db.prepare(`UPDATE tickets SET used = 1 WHERE id = ?`).run(id);
}

export function listTicketsByFunction(function_id) {
  return db.prepare(`
    SELECT * FROM tickets
    WHERE function_id = ?
    ORDER BY created_at DESC
  `).all(function_id);
}

// --- Helper opcional para loguear pagos ---
export function logPayment({ id, status, amount, currency, email, raw }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pagos (id, status, amount, currency, email, raw)
    VALUES (@id, @status, @amount, @currency, @email, @raw)
  `);
  return stmt.run({ id, status, amount, currency, email, raw });
}

export default db;
