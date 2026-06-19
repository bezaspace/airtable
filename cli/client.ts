/**
 * HTTP client for the Airtable CLI.
 *
 * Talks to the Next.js Route Handlers under /api.
 * The base URL defaults to http://localhost:3000 and can be
 * overridden with the AIRTABLE_URL environment variable.
 */

export const DEFAULT_BASE_URL =
  process.env.AIRTABLE_URL ?? "http://localhost:3000";

/** Structured error thrown when the API returns a non-2xx response. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${DEFAULT_BASE_URL}${path}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ApiError(
      `Could not reach server at ${DEFAULT_BASE_URL}: ${(err as Error).message}`,
      0,
      "network"
    );
  }

  if (res.status === 204) return null;

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    const code =
      res.status === 404
        ? "not_found"
        : res.status >= 400 && res.status < 500
          ? "validation"
          : "server";
    throw new ApiError(message, res.status, code);
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Types — mirrored from src/lib/types.ts + queries.ts to keep CLI standalone
// ---------------------------------------------------------------------------

export type ColumnType =
  | "TEXT"
  | "NUMBER"
  | "LONG_TEXT"
  | "CHECKBOX"
  | "SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "URL"
  | "EMAIL"
  | "LINK"
  | "LOOKUP"
  | "ROLLUP";

export interface ColumnConfig {
  targetTableId?: number;
  linkColumnId?: number;
  targetColumnId?: number;
  aggregation?: "count" | "sum" | "min" | "max" | "avg" | "join";
}

export interface ColumnOption {
  id: number;
  column_id: number;
  value: string;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export interface Link {
  id: number;
  link_column_id: number;
  source_row_id: number;
  target_row_id: number;
  created_at: string;
}

export interface Base {
  id: number;
  name: string;
  created_at: string;
}

export interface Table {
  id: number;
  base_id: number;
  name: string;
  created_at: string;
}

export interface Column {
  id: number;
  table_id: number;
  name: string;
  type: ColumnType;
  sort_order: number;
  created_at: string;
}

export interface Row {
  id: number;
  table_id: number;
  created_at: string;
}

export interface Cell {
  id: number;
  row_id: number;
  column_id: number;
  value: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw EAV cell map: { [rowId]: { [columnId]: value } } */
export interface TableData {
  table: Table;
  columns: Column[];
  rows: Row[];
  cells: Record<number, Record<number, string | null>>;
}

/** Formatted row: { rowId, ...columnName: value } */
export interface FormattedRow {
  rowId: number;
  [columnName: string]: number | string | null;
}

/** Formatted table data: rows as name-keyed objects */
export interface FormattedTableData {
  table: Table;
  columns: Column[];
  rows: FormattedRow[];
}

/** A row to create, with cell values keyed by column name. */
export interface RowInput {
  [columnName: string]: string | number | null;
}

/** A created row with its cells, keyed by column name. */
export interface RowWithCells {
  row: Row;
  cells: Record<string, string | null>;
}

/** Result of a bulk delete: which ids were deleted, which were missing. */
export interface BulkDeleteResult {
  deleted: number[];
  missing: number[];
}

/** One entry in a bulk cell update. */
export interface CellUpdateInput {
  rowId: number;
  column?: string;
  columnId?: number;
  value: string | number | null;
}

/** One table's result in a bulk get. */
export interface BulkTableResult {
  tableId: number;
  found: boolean;
  data: FormattedTableData | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const client = {
  // Bases
  listBases: () => request("GET", "/api/bases") as Promise<Base[]>,
  createBase: (name: string) =>
    request("POST", "/api/bases", { name }) as Promise<Base>,
  renameBase: (id: number, name: string) =>
    request("PATCH", `/api/bases/${id}`, { name }) as Promise<Base>,
  deleteBase: (id: number) => request("DELETE", `/api/bases/${id}`),
  deleteBases: (ids: number[]) =>
    request("DELETE", "/api/bases", { ids }) as Promise<BulkDeleteResult>,
  getBaseSchema: (id: number) =>
    request("GET", `/api/bases/${id}/schema`) as Promise<unknown>,

  // Tables
  listTables: (baseId: number) =>
    request("GET", `/api/bases/${baseId}/tables`) as Promise<Table[]>,
  getTable: (id: number, format: "rows" | "raw" = "rows") =>
    request("GET", `/api/tables/${id}?format=${format}`) as Promise<
      FormattedTableData | TableData
    >,
  getTablesBulk: (ids: number[], format: "rows" | "raw" = "rows") =>
    request("POST", "/api/tables/bulk", { ids, format }) as Promise<
      BulkTableResult[]
    >,
  createTable: (baseId: number, name: string) =>
    request("POST", `/api/bases/${baseId}/tables`, { name }) as Promise<Table>,
  renameTable: (id: number, name: string) =>
    request("PATCH", `/api/tables/${id}`, { name }) as Promise<Table>,
  reorderColumns: (tableId: number, columnOrder: number[]) =>
    request("PATCH", `/api/tables/${tableId}`, { columnOrder }) as Promise<unknown>,
  deleteTable: (id: number) => request("DELETE", `/api/tables/${id}`),
  deleteTables: (ids: number[]) =>
    request("DELETE", "/api/tables", { ids }) as Promise<BulkDeleteResult>,
  listAllTables: () => request("GET", "/api/tables") as Promise<Table[]>,

  // Columns
  createColumn: (
    tableId: number,
    name: string,
    type: ColumnType,
    config?: ColumnConfig,
    options?: string[]
  ) =>
    request("POST", `/api/tables/${tableId}/columns`, {
      name,
      type,
      config,
      options,
    }) as Promise<Column>,
  createColumnsBulk: (
    tableId: number,
    columns: { name: string; type: ColumnType; config?: ColumnConfig; options?: string[] }[]
  ) =>
    request("POST", `/api/tables/${tableId}/columns`, {
      columns,
    }) as Promise<Column[]>,
  renameColumn: (id: number, name: string) =>
    request("PATCH", `/api/columns/${id}`, { name }) as Promise<Column>,
  setColumnWidth: (id: number, width: number) =>
    request("PATCH", `/api/columns/${id}`, { width }) as Promise<Column>,
  setColumnPrimary: (id: number) =>
    request("PATCH", `/api/columns/${id}`, { isPrimary: true }) as Promise<Column>,
  deleteColumn: (id: number) => request("DELETE", `/api/columns/${id}`),
  deleteColumns: (tableId: number, ids: number[]) =>
    request("DELETE", `/api/tables/${tableId}/columns`, {
      ids,
    }) as Promise<BulkDeleteResult>,

  // Column options (SELECT / MULTI_SELECT)
  listColumnOptions: (columnId: number) =>
    request("GET", `/api/columns/${columnId}/options`) as Promise<ColumnOption[]>,
  addColumnOption: (columnId: number, value: string, color?: string | null) =>
    request("POST", `/api/columns/${columnId}/options`, {
      value,
      color: color ?? null,
    }) as Promise<ColumnOption>,
  deleteColumnOption: (columnId: number, optionId: number) =>
    request("DELETE", `/api/columns/${columnId}/options`, { optionId }),

  // Links (LINK column type)
  addLink: (linkColumnId: number, sourceRowId: number, targetRowId: number) =>
    request("POST", "/api/links", { linkColumnId, sourceRowId, targetRowId }) as Promise<Link>,
  removeLink: (linkId: number) =>
    request("DELETE", "/api/links", { linkId }),
  removeLinkByEnds: (
    linkColumnId: number,
    sourceRowId: number,
    targetRowId: number
  ) =>
    request("DELETE", "/api/links", { linkColumnId, sourceRowId, targetRowId }),

  // Rows
  createRow: (tableId: number) =>
    request("POST", `/api/tables/${tableId}/rows`) as Promise<Row>,
  createRowWithData: (tableId: number, data: RowInput) =>
    request("POST", `/api/tables/${tableId}/rows`, { data }) as Promise<
      RowWithCells
    >,
  createRowsWithData: (tableId: number, rows: RowInput[]) =>
    request("POST", `/api/tables/${tableId}/rows`, { rows }) as Promise<
      RowWithCells[]
    >,
  deleteRow: (id: number) => request("DELETE", `/api/rows/${id}`),
  deleteRows: (tableId: number, ids: number[]) =>
    request("DELETE", `/api/tables/${tableId}/rows`, {
      ids,
    }) as Promise<BulkDeleteResult>,

  // Cells
  updateCell: (
    rowId: number,
    columnId: number,
    value: string | number | null
  ) =>
    request("PUT", "/api/cells", { rowId, columnId, value: String(value) }) as Promise<Cell>,
  updateCellByColumn: (
    rowId: number,
    column: string,
    value: string | number | null
  ) =>
    request("PUT", "/api/cells", {
      rowId,
      column,
      value: value === null ? null : String(value),
    }) as Promise<Cell>,
  updateCellsBulk: (tableId: number, updates: CellUpdateInput[]) =>
    request("PUT", "/api/cells", { tableId, updates }) as Promise<Cell[]>,
};
