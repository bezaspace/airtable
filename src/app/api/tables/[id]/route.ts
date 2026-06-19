import { NextRequest, NextResponse } from "next/server";
import {
  getTableData,
  getTableDataFormatted,
  deleteTable,
  renameTable,
  reorderColumns,
} from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = parseId(id);
  if (tableId === null) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "rows";
  if (format !== "rows" && format !== "raw") {
    return NextResponse.json(
      { error: "Query param 'format' must be 'rows' or 'raw'" },
      { status: 400 }
    );
  }

  const data =
    format === "rows"
      ? getTableDataFormatted(tableId)
      : getTableData(tableId);

  if (!data) {
    return NextResponse.json(
      { error: `Table ${tableId} not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/tables/{id}
 *  - { name: string } → rename the table
 *  - { columnOrder: [id, id, ...] } → reorder columns
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = parseId(id);
  if (tableId === null) {
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

  const b = body as { name?: unknown; columnOrder?: unknown };

  if (typeof b.name === "string" && b.name.trim()) {
    const updated = renameTable(tableId, b.name.trim());
    if (!updated) {
      return NextResponse.json({ error: `Table ${tableId} not found` }, { status: 404 });
    }
  }

  if (Array.isArray(b.columnOrder)) {
    if (b.columnOrder.length === 0) {
      return NextResponse.json(
        { error: "Field 'columnOrder' must be a non-empty array of column ids" },
        { status: 400 }
      );
    }
    for (const cId of b.columnOrder) {
      if (typeof cId !== "number" || !Number.isInteger(cId) || cId <= 0) {
        return NextResponse.json(
          { error: `Each entry in 'columnOrder' must be a positive integer, got: ${JSON.stringify(cId)}` },
          { status: 400 }
        );
      }
    }
    reorderColumns(tableId, b.columnOrder);
  }

  // Return the refreshed table data
  const data = getTableData(tableId);
  if (!data) {
    return NextResponse.json({ error: `Table ${tableId} not found` }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = parseId(id);
  if (tableId === null) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteTable(tableId);
  return new NextResponse(null, { status: 204 });
}
