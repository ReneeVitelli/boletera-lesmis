import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Usa variable de entorno si existe (para la nube) o la ruta local por defecto
const dbPath = process.env.TICKETS_DB_PATH || path.resolve('./data/tickets.db');

// Asegura que exista la carpeta contenedora
const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });

// Abre/crea la base de datos (modo seguro y con journal para integridad)
const db = new Database(dbPath, { verbose: null });

// Crea tablas si no existen
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_function ON tickets(function_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(buyer_email);
`);

// Exporta helpers que ya usa tu código
export function insertTicket(t) {
  const stmt = db.prepare(`
    INSERT INTO tickets (
      id, buyer_name, buyer_email, buyer_phone,
      function_id, function_label, event_title,
      currency, price, used
    ) VALUES (
      @id, @buyer_name, @buyer_email, @buyer_phone,
      @function_id, @function_label, @event_title,
      @currency, @price, 0
    )
  `);
  return stmt.run(t);
}

export function getTicket(id) {
  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
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

export default db;
