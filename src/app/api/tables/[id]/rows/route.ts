import { NextRequest, NextResponse } from "next/server";
import {
  createRow,
  createRowWithData,
  createRowsWithData,
  deleteRows,
  type RowInput,
} from "@/lib/queries";
import { ColumnNotFoundError } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tables/{id}/rows
 *  - {} → create one empty row
 *  - { data: { col: val, ... } } → create one row with cell data (by column name)
 *  - { rows: [ { col: val }, ... ] } → create many rows with data (bulk)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  let body: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const b = body as {
    data?: unknown;
    rows?: unknown;
  };

  try {
    // Bulk: { rows: [ {...}, {...} ] }
    if (Array.isArray(b.rows)) {
      if (b.rows.length === 0) {
        return NextResponse.json(
          { error: "Field 'rows' must be a non-empty array" },
          { status: 400 }
        );
      }
      for (const r of b.rows) {
        if (typeof r !== "object" || r === null || Array.isArray(r)) {
          return NextResponse.json(
            { error: "Each row in 'rows' must be an object keyed by column name" },
            { status: 400 }
          );
        }
      }
      const created = createRowsWithData(tableId, b.rows as RowInput[]);
      return NextResponse.json(created, { status: 201 });
    }

    // Single with data: { data: { col: val } }
    if (b.data !== undefined) {
      if (typeof b.data !== "object" || b.data === null || Array.isArray(b.data)) {
        return NextResponse.json(
          { error: "Field 'data' must be an object keyed by column name" },
          { status: 400 }
        );
      }
      const created = createRowWithData(tableId, b.data as RowInput);
      return NextResponse.json(created, { status: 201 });
    }

    // Single empty row
    const row = createRow(tableId);
    return NextResponse.json(row, { status: 201 });
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

/** Bulk delete rows: DELETE /api/tables/{id}/rows { ids: [1,2,3] } */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "Field 'ids' must be a non-empty array of positive integers" },
      { status: 400 }
    );
  }
  for (const rId of ids) {
    if (typeof rId !== "number" || !Number.isInteger(rId) || rId <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(rId)}` },
        { status: 400 }
      );
    }
  }

  const result = deleteRows(ids);
  return NextResponse.json(result);
}
