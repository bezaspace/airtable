import db from "@/lib/db";
import type {
  Base,
  Table,
  Column,
  Row,
  Cell,
  ColumnOption,
  Link,
  TableData,
  ResolvedColumn,
  ResolvedRow,
  ResolvedOption,
  ResolvedLink,
  ColumnType,
  ColumnConfig,
  LinkConfig,
  LookupConfig,
  RollupConfig,
} from "@/lib/types";
import { COMPUTED_TYPES } from "@/lib/types";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_TYPES: ReadonlySet<string> = new Set([
  "TEXT",
  "NUMBER",
  "LONG_TEXT",
  "CHECKBOX",
  "SELECT",
  "MULTI_SELECT",
  "DATE",
  "URL",
  "EMAIL",
  "LINK",
  "LOOKUP",
  "ROLLUP",
]);

export function isValidColumnType(t: string): t is ColumnType {
  return VALID_TYPES.has(t);
}

/** Parse a column's config JSON, tolerating null/invalid. */
function parseConfig(raw: string | null): ColumnConfig {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ColumnConfig;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bases
// ---------------------------------------------------------------------------

export function listBases(): Base[] {
  return db.prepare("SELECT * FROM bases ORDER BY created_at DESC").all() as Base[];
}

export function createBase(name: string): Base {
  const result = db.prepare("INSERT INTO bases (name) VALUES (?)").run(name);
  return db.prepare("SELECT * FROM bases WHERE id = ?").get(result.lastInsertRowid) as Base;
}

export function renameBase(id: number, name: string): Base | null {
  db.prepare("UPDATE bases SET name = ? WHERE id = ?").run(name, id);
  return (db.prepare("SELECT * FROM bases WHERE id = ?").get(id) as Base | undefined) ?? null;
}

export function deleteBase(id: number): void {
  db.prepare("DELETE FROM bases WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

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

export function renameTable(id: number, name: string): Table | null {
  db.prepare("UPDATE tables SET name = ? WHERE id = ?").run(name, id);
  return (db.prepare("SELECT * FROM tables WHERE id = ?").get(id) as Table | undefined) ?? null;
}

export function deleteTable(id: number): void {
  db.prepare("DELETE FROM tables WHERE id = ?").run(id);
}

/** List all tables across all bases (used for LINK column target selection). */
export function listAllTables(): Table[] {
  return db.prepare("SELECT * FROM tables ORDER BY name ASC").all() as Table[];
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export function createColumn(
  tableId: number,
  name: string,
  type: ColumnType,
  config?: ColumnConfig
): Column {
  if (!isValidColumnType(type)) {
    throw new Error(`Invalid column type: ${type}`);
  }
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) as max_order FROM columns WHERE table_id = ?")
    .get(tableId) as { max_order: number };

  const result = db
    .prepare(
      "INSERT INTO columns (table_id, name, type, width, is_primary, config, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      tableId,
      name,
      type,
      160,
      0,
      config ? JSON.stringify(config) : null,
      maxOrder.max_order + 1
    );

  const col = db.prepare("SELECT * FROM columns WHERE id = ?").get(result.lastInsertRowid) as Column;

  // First column in a table auto-becomes primary if none is.
  const primaryCount = db
    .prepare("SELECT COUNT(*) as c FROM columns WHERE table_id = ? AND is_primary = 1")
    .get(tableId) as { c: number };
  if (primaryCount.c === 0) {
    db.prepare("UPDATE columns SET is_primary = 1 WHERE id = ?").run(col.id);
    col.is_primary = 1;
  }

  return col;
}

export function getColumn(id: number): Column | null {
  return (db.prepare("SELECT * FROM columns WHERE id = ?").get(id) as Column | undefined) ?? null;
}

export function renameColumn(id: number, name: string): Column | null {
  db.prepare("UPDATE columns SET name = ? WHERE id = ?").run(name, id);
  return getColumn(id);
}

export function setColumnWidth(id: number, width: number): Column | null {
  const clamped = Math.max(60, Math.min(800, Math.round(width)));
  db.prepare("UPDATE columns SET width = ? WHERE id = ?").run(clamped, id);
  return getColumn(id);
}

export function setColumnPrimary(id: number): Column | null {
  const col = getColumn(id);
  if (!col) return null;
  const tx = db.transaction(() => {
    db.prepare("UPDATE columns SET is_primary = 0 WHERE table_id = ?").run(col.table_id);
    db.prepare("UPDATE columns SET is_primary = 1 WHERE id = ?").run(id);
  });
  tx();
  return getColumn(id);
}

/** Reorder columns within a table. `orderedIds` is the full desired order. */
export function reorderColumns(tableId: number, orderedIds: number[]): void {
  const tx = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      db.prepare("UPDATE columns SET sort_order = ? WHERE id = ? AND table_id = ?").run(
        i,
        orderedIds[i],
        tableId
      );
    }
  });
  tx();
}

export function deleteColumn(id: number): void {
  db.prepare("DELETE FROM columns WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Column options (for SELECT / MULTI_SELECT)
// ---------------------------------------------------------------------------

export function listColumnOptions(columnId: number): ColumnOption[] {
  return db
    .prepare(
      "SELECT * FROM column_options WHERE column_id = ? ORDER BY sort_order ASC, id ASC"
    )
    .all(columnId) as ColumnOption[];
}

export function addColumnOption(
  columnId: number,
  value: string,
  color: string | null = null
): ColumnOption {
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM column_options WHERE column_id = ?")
    .get(columnId) as { m: number };
  try {
    const result = db
      .prepare(
        "INSERT INTO column_options (column_id, value, color, sort_order) VALUES (?, ?, ?, ?)"
      )
      .run(columnId, value, color, maxOrder.m + 1);
    return db.prepare("SELECT * FROM column_options WHERE id = ?").get(result.lastInsertRowid) as ColumnOption;
  } catch {
    // UNIQUE(column_id, value) violation
    throw new Error(`Option "${value}" already exists for this column`);
  }
}

export function deleteColumnOption(id: number): void {
  db.prepare("DELETE FROM column_options WHERE id = ?").run(id);
}

/** Ensure every option value exists; returns the full option list afterwards. */
export function ensureColumnOptions(columnId: number, values: string[]): ColumnOption[] {
  const tx = db.transaction(() => {
    for (const v of values) {
      const exists = db
        .prepare("SELECT 1 FROM column_options WHERE column_id = ? AND value = ?")
        .get(columnId, v);
      if (!exists) addColumnOption(columnId, v, null);
    }
  });
  tx();
  return listColumnOptions(columnId);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export function createRow(tableId: number): Row {
  const result = db.prepare("INSERT INTO rows (table_id) VALUES (?)").run(tableId);
  return db.prepare("SELECT * FROM rows WHERE id = ?").get(result.lastInsertRowid) as Row;
}

export function deleteRow(id: number): void {
  db.prepare("DELETE FROM rows WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Cells (scalar)
// ---------------------------------------------------------------------------

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
// Links (LINK column type)
// ---------------------------------------------------------------------------

export function addLink(linkColumnId: number, sourceRowId: number, targetRowId: number): Link {
  try {
    const result = db
      .prepare(
        "INSERT INTO links (link_column_id, source_row_id, target_row_id) VALUES (?, ?, ?)"
      )
      .run(linkColumnId, sourceRowId, targetRowId);
    return db.prepare("SELECT * FROM links WHERE id = ?").get(result.lastInsertRowid) as Link;
  } catch {
    throw new Error("Link already exists or rows are invalid");
  }
}

export function removeLink(linkId: number): void {
  db.prepare("DELETE FROM links WHERE id = ?").run(linkId);
}

export function removeLinkByEnds(
  linkColumnId: number,
  sourceRowId: number,
  targetRowId: number
): void {
  db.prepare(
    "DELETE FROM links WHERE link_column_id = ? AND source_row_id = ? AND target_row_id = ?"
  ).run(linkColumnId, sourceRowId, targetRowId);
}

/** All links originating from a given table's rows (via a specific link column). */
export function listLinksForColumn(linkColumnId: number): Link[] {
  return db
    .prepare("SELECT * FROM links WHERE link_column_id = ? ORDER BY id ASC")
    .all(linkColumnId) as Link[];
}

/** All links for all link columns in a table. Returns map: linkColumnId -> Link[]. */
export function listLinksForTable(tableId: number): Record<number, Link[]> {
  const linkColIds = db
    .prepare("SELECT id FROM columns WHERE table_id = ? AND type = 'LINK'")
    .all(tableId) as { id: number }[];
  const result: Record<number, Link[]> = {};
  for (const { id } of linkColIds) {
    result[id] = listLinksForColumn(id);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Column-name resolution (kept for CLI/bulk compat)
// ---------------------------------------------------------------------------

export function getColumnsByName(tableId: number): Record<string, Column> {
  const columns = db
    .prepare("SELECT * FROM columns WHERE table_id = ?")
    .all(tableId) as Column[];
  const map: Record<string, Column> = {};
  for (const c of columns) map[c.name] = c;
  return map;
}

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
// Errors
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

export interface RowInput {
  [columnName: string]: string | number | null;
}

export interface RowWithCells {
  row: Row;
  cells: Record<string, string | null>;
}

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
      const exists = db.prepare("SELECT 1 FROM rows WHERE id = ?").get(id);
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
      const exists = db.prepare("SELECT 1 FROM columns WHERE id = ?").get(id);
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
      const exists = db.prepare("SELECT 1 FROM tables WHERE id = ?").get(id);
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
      const exists = db.prepare("SELECT 1 FROM bases WHERE id = ?").get(id);
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
  column?: string;
  columnId?: number;
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
// Computed columns: LOOKUP & ROLLUP
// ---------------------------------------------------------------------------

/**
 * Compute the value of a LOOKUP or ROLLUP column for a single source row.
 * Returns null if there are no linked rows or the target column is empty.
 */
function computeColumn(
  col: Column,
  config: ColumnConfig,
  sourceRowId: number,
  /** preloaded links for this link column: targetRowId[] */
  linkedTargetIds: number[]
): string | null {
  if (config === null) return null;

  if (col.type === "LOOKUP") {
    const cfg = config as LookupConfig;
    if (linkedTargetIds.length === 0) return null;
    // Take the first linked row's value (Airtable shows all, but first is fine for MVP).
    const cell = db
      .prepare("SELECT value FROM cells WHERE row_id = ? AND column_id = ?")
      .get(linkedTargetIds[0], cfg.targetColumnId) as { value: string | null } | undefined;
    return cell?.value ?? null;
  }

  if (col.type === "ROLLUP") {
    const cfg = config as RollupConfig;
    if (linkedTargetIds.length === 0) return null;

    if (cfg.aggregation === "count") {
      return String(linkedTargetIds.length);
    }

    // Fetch all target cell values
    const placeholders = linkedTargetIds.map(() => "?").join(",");
    const cells = db
      .prepare(
        `SELECT value FROM cells WHERE column_id = ? AND row_id IN (${placeholders})`
      )
      .all(cfg.targetColumnId, ...linkedTargetIds) as { value: string | null }[];

    const values = cells
      .map((c) => c.value)
      .filter((v): v is string => v !== null && v !== "");

    if (cfg.aggregation === "join") {
      return values.join(", ");
    }

    // Numeric aggregations
    const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return null;

    switch (cfg.aggregation) {
      case "sum":
        return String(nums.reduce((a, b) => a + b, 0));
      case "min":
        return String(Math.min(...nums));
      case "max":
        return String(Math.max(...nums));
      case "avg":
        return String(nums.reduce((a, b) => a + b, 0) / nums.length);
      default:
        return null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resolved table data (the rich payload the UI consumes)
// ---------------------------------------------------------------------------

/** Get the display label for a row = primary field value, or "#<id>". */
function getRowLabel(
  rowId: number,
  columns: Column[],
  cellsByRow: Record<number, Record<number, string | null>>
): string {
  const primary = columns.find((c) => c.is_primary === 1);
  if (!primary) return `#${rowId}`;
  const val = cellsByRow[rowId]?.[primary.id];
  return val && val.trim() ? val : `#${rowId}`;
}

export function getTableData(tableId: number): TableData | null {
  const table = db.prepare("SELECT * FROM tables WHERE id = ?").get(tableId) as Table | undefined;
  if (!table) return null;

  const rawColumns = db
    .prepare("SELECT * FROM columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC")
    .all(tableId) as Column[];
  const rows = db
    .prepare("SELECT * FROM rows WHERE table_id = ? ORDER BY id ASC")
    .all(tableId) as Row[];

  // --- Cells ---
  const cellsByRow: Record<number, Record<number, string | null>> = {};
  const allCells = db
    .prepare("SELECT * FROM cells WHERE row_id IN (SELECT id FROM rows WHERE table_id = ?)")
    .all(tableId) as Cell[];
  for (const cell of allCells) {
    if (!cellsByRow[cell.row_id]) cellsByRow[cell.row_id] = {};
    cellsByRow[cell.row_id][cell.column_id] = cell.value;
  }

  // --- Options for SELECT / MULTI_SELECT columns ---
  const optionsByColumn: Record<number, ResolvedOption[]> = {};
  for (const col of rawColumns) {
    if (col.type === "SELECT" || col.type === "MULTI_SELECT") {
      optionsByColumn[col.id] = listColumnOptions(col.id).map((o) => ({
        id: o.id,
        value: o.value,
        color: o.color,
      }));
    }
  }

  // --- Links for LINK columns ---
  const linksByColumn = listLinksForTable(tableId);
  const relatedTables = new Set<number>();
  for (const col of rawColumns) {
    if (col.type === "LINK") {
      const cfg = parseConfig(col.config) as LinkConfig | null;
      if (cfg?.targetTableId) relatedTables.add(cfg.targetTableId);
    }
  }

  // Preload labels for all linked target rows (across all link columns)
  const allTargetRowIds = new Set<number>();
  for (const links of Object.values(linksByColumn)) {
    for (const l of links) allTargetRowIds.add(l.target_row_id);
  }
  const targetLabels: Record<number, string> = {};
  if (allTargetRowIds.size > 0) {
    // Group target rows by their table to compute labels
    const targetRows = db
      .prepare(
        `SELECT id, table_id FROM rows WHERE id IN (${[...allTargetRowIds].map(() => "?").join(",")})`
      )
      .all(...allTargetRowIds) as { id: number; table_id: number }[];

    // Group by table
    const rowsByTable: Record<number, number[]> = {};
    for (const r of targetRows) {
      (rowsByTable[r.table_id] ??= []).push(r.id);
    }

    for (const [tgtTableId, tgtRowIds] of Object.entries(rowsByTable)) {
      const tgtColumns = db
        .prepare("SELECT * FROM columns WHERE table_id = ? ORDER BY sort_order ASC, id ASC")
        .all(Number(tgtTableId)) as Column[];
      const tgtPrimary = tgtColumns.find((c) => c.is_primary === 1);
      if (!tgtPrimary) {
        for (const rid of tgtRowIds) targetLabels[rid] = `#${rid}`;
        continue;
      }
      const tgtCells = db
        .prepare(
          `SELECT row_id, value FROM cells WHERE column_id = ? AND row_id IN (${tgtRowIds
            .map(() => "?")
            .join(",")})`
        )
        .all(tgtPrimary.id, ...tgtRowIds) as { row_id: number; value: string | null }[];
      for (const rid of tgtRowIds) {
        const c = tgtCells.find((x) => x.row_id === rid);
        targetLabels[rid] = c?.value && c.value.trim() ? c.value : `#${rid}`;
      }
    }
  }

  // --- Build resolved columns ---
  const resolvedColumns: ResolvedColumn[] = rawColumns.map((col) => {
    const configParsed = parseConfig(col.config);
    const base: ResolvedColumn = { ...col, configParsed };
    if (col.type === "SELECT" || col.type === "MULTI_SELECT") {
      base.options = optionsByColumn[col.id];
    }
    if (col.type === "LINK") {
      base.targetTableId = (configParsed as LinkConfig | null)?.targetTableId;
    }
    if (col.type === "LOOKUP" || col.type === "ROLLUP") {
      base.linkColumnId = (configParsed as LookupConfig | RollupConfig | null)?.linkColumnId;
    }
    return base;
  });

  // --- Build resolved rows ---
  const resolvedRows: ResolvedRow[] = rows.map((row) => {
    const cells = cellsByRow[row.id] ?? {};
    const links: Record<number, ResolvedLink[]> = {};
    const computed: Record<number, string | null> = {};

    for (const col of rawColumns) {
      if (col.type === "LINK") {
        const colLinks = linksByColumn[col.id] ?? [];
        links[col.id] = colLinks
          .filter((l) => l.source_row_id === row.id)
          .map((l) => ({
            linkId: l.id,
            targetRowId: l.target_row_id,
            targetLabel: targetLabels[l.target_row_id] ?? `#${l.target_row_id}`,
          }));
      } else if (COMPUTED_TYPES.includes(col.type)) {
        const cfg = parseConfig(col.config);
        if (cfg && "linkColumnId" in cfg) {
          const colLinks = linksByColumn[cfg.linkColumnId] ?? [];
          const targetIds = colLinks
            .filter((l) => l.source_row_id === row.id)
            .map((l) => l.target_row_id);
          computed[col.id] = computeColumn(col, cfg, row.id, targetIds);
        }
      }
    }

    return {
      row,
      cells,
      links,
      computed,
      label: getRowLabel(row.id, rawColumns, cellsByRow),
    };
  });

  // --- Related table names ---
  const relatedTableNames: Record<number, string> = {};
  if (relatedTables.size > 0) {
    const ids = [...relatedTables];
    const placeholders = ids.map(() => "?").join(",");
    const tables = db
      .prepare(`SELECT id, name FROM tables WHERE id IN (${placeholders})`)
      .all(...ids) as { id: number; name: string }[];
    for (const t of tables) relatedTableNames[t.id] = t.name;
  }

  return {
    table,
    columns: resolvedColumns,
    rows: resolvedRows,
    relatedTables: relatedTableNames,
  };
}

// ---------------------------------------------------------------------------
// Formatted table data (rows as name-keyed objects, for CLI compat)
// ---------------------------------------------------------------------------

export interface FormattedRow {
  rowId: number;
  [columnName: string]: number | string | null;
}

export interface FormattedTableData {
  table: Table;
  columns: Column[];
  rows: FormattedRow[];
}

export function getTableDataFormatted(tableId: number): FormattedTableData | null {
  const raw = getTableData(tableId);
  if (!raw) return null;

  const colNameById: Record<number, string> = {};
  for (const c of raw.columns) colNameById[c.id] = c.name;

  const rows: FormattedRow[] = raw.rows.map((r) => {
    const formatted: FormattedRow = { rowId: r.row.id };
    for (const c of raw.columns) {
      if (c.type === "LINK") {
        // Represent links as a comma-joined list of target labels
        const labels = (r.links[c.id] ?? []).map((l) => l.targetLabel);
        formatted[c.name] = labels.length > 0 ? labels.join(", ") : null;
      } else if (c.type === "LOOKUP" || c.type === "ROLLUP") {
        formatted[c.name] = r.computed[c.id] ?? null;
      } else {
        formatted[c.name] = r.cells[c.id] ?? null;
      }
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

export function getTablesBulk(
  tableIds: number[],
  format: "rows" | "raw" = "rows"
): BulkTableResult[] {
  return tableIds.map((id) => {
    const data =
      format === "rows"
        ? getTableDataFormatted(id)
        : (getTableData(id) as unknown as FormattedTableData | null);
    return { tableId: id, found: data !== null, data };
  });
}
