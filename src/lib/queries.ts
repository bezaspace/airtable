import db from "@/lib/db";
import type {
  Base,
  Table,
  Column,
  Row,
  Cell,
  TableData,
  ColumnType,
} from "@/lib/types";

export function listBases(): Base[] {
  return db.prepare("SELECT * FROM bases ORDER BY created_at DESC").all() as Base[];
}

export function createBase(name: string): Base {
  const result = db.prepare("INSERT INTO bases (name) VALUES (?)").run(name);
  return db.prepare("SELECT * FROM bases WHERE id = ?").get(result.lastInsertRowid) as Base;
}

export function deleteBase(id: number): void {
  db.prepare("DELETE FROM bases WHERE id = ?").run(id);
}

export function listTables(baseId: number): Table[] {
  return db
    .prepare("SELECT * FROM tables WHERE base_id = ? ORDER BY created_at DESC")
    .all(baseId) as Table[];
}

export function createTable(baseId: number, name: string): Table {
  const result = db
    .prepare("INSERT INTO tables (base_id, name) VALUES (?, ?)")
    .run(baseId, name);
  return db.prepare("SELECT * FROM tables WHERE id = ?").get(result.lastInsertRowid) as Table;
}

export function deleteTable(id: number): void {
  db.prepare("DELETE FROM tables WHERE id = ?").run(id);
}

export function getTableData(tableId: number): TableData | null {
  const table = db.prepare("SELECT * FROM tables WHERE id = ?").get(tableId) as Table | undefined;
  if (!table) return null;

  const columns = db
    .prepare("SELECT * FROM columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC")
    .all(tableId) as Column[];
  const rows = db
    .prepare("SELECT * FROM rows WHERE table_id = ? ORDER BY id ASC")
    .all(tableId) as Row[];

  const cells: Record<number, Record<number, string | null>> = {};
  const allCells = db
    .prepare("SELECT * FROM cells WHERE row_id IN (SELECT id FROM rows WHERE table_id = ?)")
    .all(tableId) as Cell[];

  for (const cell of allCells) {
    if (!cells[cell.row_id]) {
      cells[cell.row_id] = {};
    }
    cells[cell.row_id][cell.column_id] = cell.value;
  }

  return { table, columns, rows, cells };
}

export function createColumn(
  tableId: number,
  name: string,
  type: ColumnType
): Column {
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) as max_order FROM columns WHERE table_id = ?")
    .get(tableId) as { max_order: number };

  const result = db
    .prepare("INSERT INTO columns (table_id, name, type, sort_order) VALUES (?, ?, ?, ?)")
    .run(tableId, name, type, maxOrder.max_order + 1);

  return db.prepare("SELECT * FROM columns WHERE id = ?").get(result.lastInsertRowid) as Column;
}

export function deleteColumn(id: number): void {
  db.prepare("DELETE FROM columns WHERE id = ?").run(id);
}

export function createRow(tableId: number): Row {
  const result = db.prepare("INSERT INTO rows (table_id) VALUES (?)").run(tableId);
  return db.prepare("SELECT * FROM rows WHERE id = ?").get(result.lastInsertRowid) as Row;
}

export function deleteRow(id: number): void {
  db.prepare("DELETE FROM rows WHERE id = ?").run(id);
}

export function updateCell(
  rowId: number,
  columnId: number,
  value: string | null
): Cell {
  const existing = db
    .prepare("SELECT * FROM cells WHERE row_id = ? AND column_id = ?")
    .get(rowId, columnId) as Cell | undefined;

  if (existing) {
    db.prepare("UPDATE cells SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      value,
      existing.id
    );
    return db.prepare("SELECT * FROM cells WHERE id = ?").get(existing.id) as Cell;
  }

  const result = db
    .prepare("INSERT INTO cells (row_id, column_id, value) VALUES (?, ?, ?)")
    .run(rowId, columnId, value);
  return db.prepare("SELECT * FROM cells WHERE id = ?").get(result.lastInsertRowid) as Cell;
}

// ---------------------------------------------------------------------------
// Column-name resolution
// ---------------------------------------------------------------------------

/** Map of column name -> column, for a given table. Case-sensitive. */
export function getColumnsByName(tableId: number): Record<string, Column> {
  const columns = db
    .prepare("SELECT * FROM columns WHERE table_id = ?")
    .all(tableId) as Column[];
  const map: Record<string, Column> = {};
  for (const c of columns) map[c.name] = c;
  return map;
}

/** Resolve a column name to its id within a table, or throw. */
export function resolveColumnId(tableId: number, name: string): number {
  const col = db
    .prepare("SELECT id FROM columns WHERE table_id = ? AND name = ?")
    .get(tableId, name) as { id: number } | undefined;
  if (!col) {
    throw new ColumnNotFoundError(tableId, name);
  }
  return col.id;
}

// ---------------------------------------------------------------------------
// Errors thrown by bulk operations (caught by route handlers)
// ---------------------------------------------------------------------------

export class ColumnNotFoundError extends Error {
  constructor(
    readonly tableId: number,
    readonly columnName: string
  ) {
    super(`Column "${columnName}" not found in table ${tableId}`);
    this.name = "ColumnNotFoundError";
  }
}

export class RowNotFoundError extends Error {
  constructor(readonly rowId: number) {
    super(`Row ${rowId} not found`);
    this.name = "RowNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Bulk: create rows WITH data (keyed by column name)
// ---------------------------------------------------------------------------

/** A row to create, with cell values keyed by column name. */
export interface RowInput {
  [columnName: string]: string | number | null;
}

/** A created row with its cells, keyed by column name. */
export interface RowWithCells {
  row: Row;
  cells: Record<string, string | null>;
}

/**
 * Create one row and set all its cells in a single transaction.
 * Values are keyed by column name. Missing columns stay empty.
 */
export function createRowWithData(tableId: number, data: RowInput): RowWithCells {
  const colsByName = getColumnsByName(tableId);

  const tx = db.transaction(() => {
    const row = createRow(tableId);
    const cells: Record<string, string | null> = {};
    for (const [colName, rawValue] of Object.entries(data)) {
      const col = colsByName[colName];
      if (!col) throw new ColumnNotFoundError(tableId, colName);
      const value = rawValue === null ? null : String(rawValue);
      updateCell(row.id, col.id, value);
      cells[colName] = value;
    }
    return { row, cells };
  });

  return tx();
}

/**
 * Create many rows with data in a single transaction.
 * Returns the created rows with their cells.
 */
export function createRowsWithData(
  tableId: number,
  rows: RowInput[]
): RowWithCells[] {
  const tx = db.transaction(() => {
    return rows.map((r) => createRowWithData(tableId, r));
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Bulk: delete rows / columns / tables / bases
// ---------------------------------------------------------------------------

export function deleteRows(ids: number[]): { deleted: number[]; missing: number[] } {
  const deleted: number[] = [];
  const missing: number[] = [];
  const tx = db.transaction(() => {
    for (const id of ids) {
      const exists = db
        .prepare("SELECT 1 FROM rows WHERE id = ?")
        .get(id);
      if (exists) {
        deleteRow(id);
        deleted.push(id);
      } else {
        missing.push(id);
      }
    }
  });
  tx();
  return { deleted, missing };
}

export function deleteColumns(ids: number[]): { deleted: number[]; missing: number[] } {
  const deleted: number[] = [];
  const missing: number[] = [];
  const tx = db.transaction(() => {
    for (const id of ids) {
      const exists = db
        .prepare("SELECT 1 FROM columns WHERE id = ?")
        .get(id);
      if (exists) {
        deleteColumn(id);
        deleted.push(id);
      } else {
        missing.push(id);
      }
    }
  });
  tx();
  return { deleted, missing };
}

export function deleteTables(ids: number[]): { deleted: number[]; missing: number[] } {
  const deleted: number[] = [];
  const missing: number[] = [];
  const tx = db.transaction(() => {
    for (const id of ids) {
      const exists = db
        .prepare("SELECT 1 FROM tables WHERE id = ?")
        .get(id);
      if (exists) {
        deleteTable(id);
        deleted.push(id);
      } else {
        missing.push(id);
      }
    }
  });
  tx();
  return { deleted, missing };
}

export function deleteBases(ids: number[]): { deleted: number[]; missing: number[] } {
  const deleted: number[] = [];
  const missing: number[] = [];
  const tx = db.transaction(() => {
    for (const id of ids) {
      const exists = db
        .prepare("SELECT 1 FROM bases WHERE id = ?")
        .get(id);
      if (exists) {
        deleteBase(id);
        deleted.push(id);
      } else {
        missing.push(id);
      }
    }
  });
  tx();
  return { deleted, missing };
}

// ---------------------------------------------------------------------------
// Bulk: update cells (keyed by column name OR column id)
// ---------------------------------------------------------------------------

export interface CellUpdateInput {
  rowId: number;
  column?: string; // column name
  columnId?: number; // column id (alternative)
  value: string | number | null;
}

export function updateCellsBulk(
  tableId: number,
  updates: CellUpdateInput[]
): Cell[] {
  const colsByName = getColumnsByName(tableId);
  const tx = db.transaction(() => {
    const result: Cell[] = [];
    for (const u of updates) {
      let colId: number;
      if (u.columnId !== undefined) {
        colId = u.columnId;
      } else if (u.column !== undefined) {
        const col = colsByName[u.column];
        if (!col) throw new ColumnNotFoundError(tableId, u.column);
        colId = col.id;
      } else {
        throw new Error("Each cell update must specify either 'column' or 'columnId'");
      }
      const value = u.value === null ? null : String(u.value);
      result.push(updateCell(u.rowId, colId, value));
    }
    return result;
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Formatted table data: rows as name-keyed objects
// ---------------------------------------------------------------------------

/** A row rendered as { rowId, ...columnName: value }. */
export interface FormattedRow {
  rowId: number;
  [columnName: string]: number | string | null;
}

export interface FormattedTableData {
  table: Table;
  columns: Column[];
  rows: FormattedRow[];
}

/** Get a table's data with each row as an object keyed by column name. */
export function getTableDataFormatted(tableId: number): FormattedTableData | null {
  const raw = getTableData(tableId);
  if (!raw) return null;

  // Build column id -> name map
  const colNameById: Record<number, string> = {};
  for (const c of raw.columns) colNameById[c.id] = c.name;

  const rows: FormattedRow[] = raw.rows.map((r) => {
    const formatted: FormattedRow = { rowId: r.id };
    const rowCells = raw.cells[r.id] ?? {};
    for (const c of raw.columns) {
      formatted[c.name] = rowCells[c.id] ?? null;
    }
    return formatted;
  });

  return { table: raw.table, columns: raw.columns, rows };
}

// ---------------------------------------------------------------------------
// Bulk: get data for multiple tables at once
// ---------------------------------------------------------------------------

export interface BulkTableResult {
  tableId: number;
  found: boolean;
  data: FormattedTableData | null;
}

/** Get formatted data for many tables in one call. */
export function getTablesBulk(
  tableIds: number[],
  format: "rows" | "raw" = "rows"
): BulkTableResult[] {
  return tableIds.map((id) => {
    const data =
      format === "rows" ? getTableDataFormatted(id) : (getTableData(id) as unknown as FormattedTableData | null);
    return { tableId: id, found: data !== null, data };
  });
}
