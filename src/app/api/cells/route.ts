import { NextRequest, NextResponse } from "next/server";
import {
  updateCell,
  updateCellsBulk,
  resolveColumnId,
  ColumnNotFoundError,
  type CellUpdateInput,
} from "@/lib/queries";

/**
 * PUT /api/cells
 *  - Single: { rowId, columnId, value } or { rowId, column, value }
 *  - Bulk:   { tableId, updates: [ { rowId, column|columnId, value }, ... ] }
 */
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    rowId?: unknown;
    columnId?: unknown;
    column?: unknown;
    value?: unknown;
    tableId?: unknown;
    updates?: unknown;
  };

  try {
    // Bulk: { tableId, updates: [...] }
    if (Array.isArray(b.updates)) {
      if (typeof b.tableId !== "number" || !Number.isInteger(b.tableId) || b.tableId <= 0) {
        return NextResponse.json(
          { error: "Field 'tableId' is required for bulk updates and must be a positive integer" },
          { status: 400 }
        );
      }
      if (b.updates.length === 0) {
        return NextResponse.json(
          { error: "Field 'updates' must be a non-empty array" },
          { status: 400 }
        );
      }
      const validated: CellUpdateInput[] = [];
      for (let i = 0; i < b.updates.length; i++) {
        const u = b.updates[i] as CellUpdateInput & { value?: unknown };
        if (typeof u?.rowId !== "number" || !Number.isInteger(u.rowId) || u.rowId <= 0) {
          return NextResponse.json(
            { error: `updates[${i}].rowId must be a positive integer` },
            { status: 400 }
          );
        }
        if (u.column === undefined && u.columnId === undefined) {
          return NextResponse.json(
            { error: `updates[${i}] must specify 'column' (name) or 'columnId'` },
            { status: 400 }
          );
        }
        if (u.value !== null && typeof u.value !== "string" && typeof u.value !== "number") {
          return NextResponse.json(
            { error: `updates[${i}].value must be a string, number, or null` },
            { status: 400 }
          );
        }
        validated.push({
          rowId: u.rowId,
          column: typeof u.column === "string" ? u.column : undefined,
          columnId: typeof u.columnId === "number" ? u.columnId : undefined,
          value: u.value ?? null,
        });
      }
      const cells = updateCellsBulk(b.tableId, validated);
      return NextResponse.json(cells);
    }

    // Single cell
    if (typeof b.rowId !== "number" || !Number.isInteger(b.rowId) || b.rowId <= 0) {
      return NextResponse.json(
        { error: "Field 'rowId' is required and must be a positive integer" },
        { status: 400 }
      );
    }
    if (b.value !== null && typeof b.value !== "string" && typeof b.value !== "number") {
      return NextResponse.json(
        { error: "Field 'value' must be a string, number, or null" },
        { status: 400 }
      );
    }

    let columnId: number;
    if (typeof b.columnId === "number") {
      columnId = b.columnId;
    } else if (typeof b.column === "string") {
      // Need tableId to resolve column name → id. Derive tableId from the row.
      // The row's table_id is needed; resolve via DB.
      const row = await import("@/lib/db").then((m) =>
        m.default.prepare("SELECT table_id FROM rows WHERE id = ?").get(b.rowId as number)
      ) as { table_id: number } | undefined;
      if (!row) {
        return NextResponse.json(
          { error: `Row ${b.rowId} not found` },
          { status: 404 }
        );
      }
      columnId = resolveColumnId(row.table_id, b.column);
    } else {
      return NextResponse.json(
        { error: "Either 'columnId' (number) or 'column' (name string) is required" },
        { status: 400 }
      );
    }

    const value = b.value === null ? null : String(b.value);
    const cell = updateCell(b.rowId, columnId, value);
    return NextResponse.json(cell);
  } catch (err) {
    if (err instanceof ColumnNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: "column_not_found" },
        { status: 400 }
      );
    }
    throw err;
  }
}
