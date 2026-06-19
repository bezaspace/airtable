// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

/**
 * Field types supported by a column.
 * - TEXT / NUMBER: original scalar types
 * - LONG_TEXT: multi-line text
 * - CHECKBOX: boolean (stored as "0"/"1")
 * - SELECT: single-select from column_options
 * - MULTI_SELECT: multi-select from column_options (stored as newline-joined)
 * - DATE: ISO date string (YYYY-MM-DD)
 * - URL / EMAIL: validated text rendered as links
 * - LINK: relationship to rows in another table (uses the links table)
 * - LOOKUP: read-only, pulls a field from linked rows
 * - ROLLUP: read-only, aggregates a field from linked rows
 */
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

/** Field types a user can create directly (computed ones are created via API). */
export const CREATABLE_TYPES: ColumnType[] = [
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
];

/** Read-only computed column types. */
export const COMPUTED_TYPES: ColumnType[] = ["LOOKUP", "ROLLUP"];

/** Per-type config stored as JSON in columns.config. */
export interface LinkConfig {
  targetTableId: number;
  /** Optional: restrict links to rows where this column equals this value. */
  filter?: Record<string, string>;
}

export interface LookupConfig {
  linkColumnId: number;
  targetColumnId: number;
}

export interface RollupConfig {
  linkColumnId: number;
  targetColumnId: number;
  /** "count" | "sum" | "min" | "max" | "avg" | "join" */
  aggregation: "count" | "sum" | "min" | "max" | "avg" | "join";
}

export type ColumnConfig = LinkConfig | LookupConfig | RollupConfig | null;

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

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
  width: number;
  is_primary: number; // 0 | 1 (SQLite has no native bool)
  config: string | null; // JSON string of ColumnConfig
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

// ---------------------------------------------------------------------------
// Aggregated table data (what the UI / API returns)
// ---------------------------------------------------------------------------

/** A resolved option for a select/multiselect column. */
export interface ResolvedOption {
  id: number;
  value: string;
  color: string | null;
}

/** A resolved link target (id + primary-field display value). */
export interface ResolvedLink {
  linkId: number;
  targetRowId: number;
  targetLabel: string;
}

/** Column metadata enriched with parsed config + resolved options/links. */
export interface ResolvedColumn extends Column {
  /** Parsed config object (null if no config). */
  configParsed: ColumnConfig;
  /** Options for SELECT / MULTI_SELECT columns. */
  options?: ResolvedOption[];
  /** For LINK columns: the target table id (from config). */
  targetTableId?: number;
  /** For LOOKUP/ROLLUP: the source link column id. */
  linkColumnId?: number;
}

export interface ResolvedRow {
  row: Row;
  /** Cell values keyed by column id (scalar columns only). */
  cells: Record<number, string | null>;
  /** Links keyed by link column id. */
  links: Record<number, ResolvedLink[]>;
  /** Computed values for LOOKUP/ROLLUP columns, keyed by column id. */
  computed: Record<number, string | null>;
  /** Display label = primary field value (or row id). */
  label: string;
}

export interface TableData {
  table: Table;
  columns: ResolvedColumn[];
  rows: ResolvedRow[];
  /** For convenience: map of table id -> table name for linked tables. */
  relatedTables: Record<number, string>;
}
