export type ColumnType = "TEXT" | "NUMBER";

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

export interface TableData {
  table: Table;
  columns: Column[];
  rows: Row[];
  cells: Record<number, Record<number, string | null>>;
}
