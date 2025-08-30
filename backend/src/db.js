import Database from 'better-sqlite3';

const db = new Database('./tickets.db');

// Crear tabla tickets si no existe
db.prepare(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    payment_id TEXT UNIQUE,        -- Nuevo: cada pago solo puede emitir una vez
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    function_id TEXT,
    function_label TEXT,
    event_title TEXT,
    quantity INTEGER,
    price REAL,
    currency TEXT,
    issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
    used INTEGER DEFAULT 0
  )
`).run();

// Insertar ticket
export function insertTicket(ticket) {
  return db.prepare(`
    INSERT INTO tickets (
      id, payment_id, buyer_name, buyer_email, buyer_phone,
      function_id, function_label, event_title,
      quantity, price, currency, issued_at, used
    ) VALUES (
      @id, @payment_id, @buyer_name, @buyer_email, @buyer_phone,
      @function_id, @function_label, @event_title,
      @quantity, @price, @currency, datetime('now'), 0
    )
  `).run(ticket);
}

// Buscar ticket por id (para validación QR)
export function getTicket(id) {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
}

// Marcar ticket como usado
export function markTicketUsed(id) {
  return db.prepare(`UPDATE tickets SET used = 1 WHERE id = ?`).run(id);
}

// Verificar si ya existe un ticket por payment_id
export function getTicketByPayment(payment_id) {
  return db.prepare(`SELECT * FROM tickets WHERE payment_id = ?`).get(payment_id);
}
