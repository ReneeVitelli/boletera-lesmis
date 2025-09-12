// backend/src/db.js
import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("/var/data/tickets.db");

// ---------- Migraciones ----------
db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  show TEXT NOT NULL,
  funcion TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  price INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// ---------- Funciones ----------
export function insertTicket({ show, funcion, name, email, price }) {
  const id = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO tickets (id, show, funcion, name, email, price, used)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  stmt.run(id, show, funcion, name, email, price);
  return getTicket(id);
}

export function getTicket(id) {
  const stmt = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
  return stmt.get(id);
}

export function markUsed(id) {
  const stmt = db.prepare(`
    UPDATE tickets SET used = 1 WHERE id = ?
  `);
  stmt.run(id);
  return getTicket(id);
}

// ---------- Export default + named ----------
export default db;
