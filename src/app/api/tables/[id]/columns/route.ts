import { NextRequest, NextResponse } from "next/server";
import { createColumn, deleteColumns } from "@/lib/queries";
import type { ColumnType } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_TYPES: ReadonlySet<string> = new Set(["TEXT", "NUMBER"]);

/**
 * POST /api/tables/{id}/columns
 *  - { name, type } → create one column
 *  - { columns: [ { name, type }, ... ] } → create many columns (bulk)
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    name?: unknown;
    type?: unknown;
    columns?: unknown;
  };

  // Bulk: { columns: [ { name, type }, ... ] }
  if (Array.isArray(b.columns)) {
    if (b.columns.length === 0) {
      return NextResponse.json(
        { error: "Field 'columns' must be a non-empty array" },
        { status: 400 }
      );
    }
    const validated: { name: string; type: ColumnType }[] = [];
    for (let i = 0; i < b.columns.length; i++) {
      const c = b.columns[i] as { name?: unknown; type?: unknown };
      if (typeof c?.name !== "string" || !c.name.trim()) {
        return NextResponse.json(
          { error: `columns[${i}].name is required and must be a non-empty string` },
          { status: 400 }
        );
      }
      if (typeof c?.type !== "string" || !VALID_TYPES.has(c.type)) {
        return NextResponse.json(
          { error: `columns[${i}].type must be 'TEXT' or 'NUMBER'` },
          { status: 400 }
        );
      }
      validated.push({ name: c.name.trim(), type: c.type as ColumnType });
    }
    const created = validated.map((c) => createColumn(tableId, c.name, c.type));
    return NextResponse.json(created, { status: 201 });
  }

  // Single column
  if (typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json(
      { error: "Field 'name' is required and must be a non-empty string" },
      { status: 400 }
    );
  }
  if (typeof b.type !== "string" || !VALID_TYPES.has(b.type)) {
    return NextResponse.json(
      { error: "Field 'type' is required and must be 'TEXT' or 'NUMBER'" },
      { status: 400 }
    );
  }

  const column = createColumn(tableId, b.name.trim(), b.type as ColumnType);
  return NextResponse.json(column, { status: 201 });
}

/** Bulk delete columns: DELETE /api/tables/{id}/columns { ids: [1,2,3] } */
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
  for (const cId of ids) {
    if (typeof cId !== "number" || !Number.isInteger(cId) || cId <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(cId)}` },
        { status: 400 }
      );
    }
  }

  const result = deleteColumns(ids);
  return NextResponse.json(result);
}
