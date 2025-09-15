// backend/src/db.js
import Database from "better-sqlite3";

// Ruta persistente en Render (y local si lo deseas)
const DB_PATH = process.env.DB_PATH || "/var/data/tickets.db";

// Abrimos la BD una sola vez
const db = new Database(DB_PATH);
// rendimiento y consistencia
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

/**
 * Helper: ¿la tabla tiene la columna?
 */
function hasColumn(table, name) {
  const row = db
    .prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
    .get(table, name);
  return !!row;
}

/**
 * Helper: agrega columna solo si falta.
 * Nota: SQLite admite `ALTER TABLE ... ADD COLUMN` (sin IF NOT EXISTS).
 */
function addColumnIfMissing(table, colDef) {
  const colName = colDef.split(/\s+/)[0];
  if (!hasColumn(table, colName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  }
}

/**
 * Crea tabla base si no existe y garantiza columnas mínimas
 * que usa la UI del ticket.
 */
export async function initSchema() {
  // Tabla base mínima; si ya existía, no se sobreescribe.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY
      -- el resto de columnas se añaden de forma idempotente abajo
    );
  `);

  // Columnas que la UI/consulta pueden leer.
  // (Si ya existían, no se vuelven a crear)
  addColumnIfMissing("tickets", "show_title   TEXT");      // título de la obra (ej. "Los Miserables")
  addColumnIfMissing("tickets", "show_when    TEXT");      // función (ej. "Sáb 6 Dic 18:00")
  addColumnIfMissing("tickets", "student_code TEXT");      // código del alumno
  addColumnIfMissing("tickets", "buyer_name   TEXT");      // nombre comprador/usuario
  addColumnIfMissing("tickets", "buyer_email  TEXT");      // correo del usuario
  addColumnIfMissing("tickets", "status       TEXT");      // estado ("VIGENTE"/"USADO")
  addColumnIfMissing("tickets", "estado       TEXT");      // alias legacy por compatibilidad
  addColumnIfMissing("tickets", "qr           TEXT");      // contenido QR (si lo estás guardando)
  addColumnIfMissing("tickets", "created_at   TEXT");      // opcional

  // Índices seguros (se crean sólo si no existen)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
  `);
}

/**
 * Entrega la conexión ya abierta (single instance).
 */
export function getDB() {
  return db;
}
