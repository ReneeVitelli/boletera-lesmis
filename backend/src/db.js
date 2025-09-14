// backend/src/db.js
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH || "/var/data/tickets.db";

let _db = null;

export function getDB() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  return _db;
}

function tableInfo(db, table) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all();
  } catch {
    return [];
  }
}

function columnExists(db, table, column) {
  const rows = tableInfo(db, table);
  return rows.some((r) => r.name === column);
}

function ensureColumn(db, table, column, ddl) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function ensureIndexOnExistingColumn(db, indexName, table, column) {
  if (!columnExists(db, table, column)) return; // no existe → no intentes crear índice
  db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column});`);
}

/**
 * Crea tablas base y aplica migraciones idempotentes.
 * Seguro para correr múltiples veces.
 */
export async function initSchema() {
  const db = getDB();

  // Tabla base (si no existe). Usa 'status' como nombre moderno por omisión.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      buyer_name TEXT,
      buyer_email TEXT,
      status TEXT DEFAULT 'vigente',
      price_cents INTEGER DEFAULT 0,
      created_at INTEGER,
      used_at INTEGER
    );
  `);

  // --- Migraciones idempotentes (no rompen datos existentes) ---
  // Algunas instalaciones viejas pudieron usar 'estado' en vez de 'status'.
  // No forzamos renombres: sólo evitamos fallas y aceptamos ambas.

  // Campos nuevos usados por el render del ticket:
  ensureColumn(db, "tickets", "show_title",   `TEXT DEFAULT 'Los Miserables'`);
  ensureColumn(db, "tickets", "function_label", `TEXT`);
  ensureColumn(db, "tickets", "alumno_code",    `TEXT`);

  // Índices: crea sólo si la columna existe (status o estado).
  ensureIndexOnExistingColumn(db, "idx_tickets_status", "tickets", "status");
  ensureIndexOnExistingColumn(db, "idx_tickets_estado", "tickets", "estado");

  // Otros índices útiles
  ensureIndexOnExistingColumn(db, "idx_tickets_buyer_email", "tickets", "buyer_email");

  return db;
}
