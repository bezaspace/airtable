import type {
  Base,
  Table,
  Column,
  Row,
  Cell,
  TableData,
  ColumnType,
} from "@/lib/types";

/**
 * Typed fetch wrappers for the Route Handlers under /api.
 * Used by client components so they keep end-to-end types
 * without Server Actions.
 */

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function jsonBody(value: unknown): { body: string } {
  return { body: JSON.stringify(value) };
}

export const api = {
  // Bases
  listBases: async (): Promise<Base[]> =>
    parseJson(await fetch("/api/bases", { method: "GET" })),

  createBase: async (name: string): Promise<Base> =>
    parseJson(
      await fetch("/api/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...jsonBody({ name }),
      })
    ),

  deleteBase: async (id: number): Promise<void> => {
    const res = await fetch(`/api/bases/${id}`, { method: "DELETE" });
    await parseJson<void>(res);
  },

  // Tables
  listTables: async (baseId: number): Promise<Table[]> =>
    parseJson(await fetch(`/api/bases/${baseId}/tables`, { method: "GET" })),

  createTable: async (baseId: number, name: string): Promise<Table> =>
    parseJson(
      await fetch(`/api/bases/${baseId}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...jsonBody({ name }),
      })
    ),

  deleteTable: async (id: number): Promise<void> => {
    const res = await fetch(`/api/tables/${id}`, { method: "DELETE" });
    await parseJson<void>(res);
  },

  getTableData: async (tableId: number): Promise<TableData | null> => {
    const res = await fetch(`/api/tables/${tableId}`, { method: "GET" });
    if (res.status === 404) return null;
    return parseJson<TableData>(res);
  },

  // Columns
  createColumn: async (
    tableId: number,
    name: string,
    type: ColumnType
  ): Promise<Column> =>
    parseJson(
      await fetch(`/api/tables/${tableId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...jsonBody({ name, type }),
      })
    ),

  deleteColumn: async (id: number): Promise<void> => {
    const res = await fetch(`/api/columns/${id}`, { method: "DELETE" });
    await parseJson<void>(res);
  },

  // Rows
  createRow: async (tableId: number): Promise<Row> =>
    parseJson(
      await fetch(`/api/tables/${tableId}/rows`, {
        method: "POST",
      })
    ),

  deleteRow: async (id: number): Promise<void> => {
    const res = await fetch(`/api/rows/${id}`, { method: "DELETE" });
    await parseJson<void>(res);
  },

  // Cells
  updateCell: async (
    rowId: number,
    columnId: number,
    value: string | null
  ): Promise<Cell> =>
    parseJson(
      await fetch("/api/cells", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        ...jsonBody({ rowId, columnId, value }),
      })
    ),
};
