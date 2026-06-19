import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "airtable.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency and performance.
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Migrations for existing databases (additive, idempotent)
// ---------------------------------------------------------------------------

function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return !!row;
}

function columnExists(tableName: string, colName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string;
  }[];
  return rows.some((r) => r.name === colName);
}

function columnsTableHasCheckConstraint(): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='columns'")
    .get() as { sql: string } | undefined;
  return !!row?.sql?.includes("CHECK");
}

// Only migrate if the columns table already exists (existing DB)
if (tableExists("columns")) {
  // Add new columns additively
  if (!columnExists("columns", "width")) {
    db.exec("ALTER TABLE columns ADD COLUMN width INTEGER NOT NULL DEFAULT 160");
  }
  if (!columnExists("columns", "is_primary")) {
    db.exec(
      "ALTER TABLE columns ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!columnExists("columns", "config")) {
    db.exec("ALTER TABLE columns ADD COLUMN config TEXT");
  }

  // Remove the CHECK(type IN ('TEXT','NUMBER')) constraint so new field types
  // are accepted. SQLite can't ALTER a constraint, so we recreate the table.
  if (columnsTableHasCheckConstraint()) {
    db.exec(`
      CREATE TABLE columns_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 160,
        is_primary INTEGER NOT NULL DEFAULT 0,
        config TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO columns_new (id, table_id, name, type, width, is_primary, config, sort_order, created_at)
      SELECT id, table_id, name, type, width, is_primary, config, sort_order, created_at FROM columns;
      DROP TABLE columns;
      ALTER TABLE columns_new RENAME TO columns;
      CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);
    `);
  }
}

// ---------------------------------------------------------------------------
// Schema (creates fresh on new DBs, no-op on existing)
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS bases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_id INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    width INTEGER NOT NULL DEFAULT 160,
    is_primary INTEGER NOT NULL DEFAULT 0,
    config TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(row_id, column_id)
  );

  CREATE TABLE IF NOT EXISTS column_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(column_id, value)
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    source_row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    target_row_id INTEGER NOT NULL REFERENCES rows(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(link_column_id, source_row_id, target_row_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tables_base_id ON tables(base_id);
  CREATE INDEX IF NOT EXISTS idx_columns_table_id ON columns(table_id);
  CREATE INDEX IF NOT EXISTS idx_rows_table_id ON rows(table_id);
  CREATE INDEX IF NOT EXISTS idx_cells_row_id ON cells(row_id);
  CREATE INDEX IF NOT EXISTS idx_cells_column_id ON cells(column_id);
  CREATE INDEX IF NOT EXISTS idx_column_options_column_id ON column_options(column_id);
  CREATE INDEX IF NOT EXISTS idx_links_link_column_id ON links(link_column_id);
  CREATE INDEX IF NOT EXISTS idx_links_source_row_id ON links(source_row_id);
  CREATE INDEX IF NOT EXISTS idx_links_target_row_id ON links(target_row_id);
`);

export default db;
