import { NextRequest, NextResponse } from "next/server";
import { listTables, createTable, deleteTables } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseId = Number(id);
  if (!Number.isInteger(baseId) || baseId <= 0) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
      { status: 400 }
    );
  }

  const tables = listTables(baseId);
  return NextResponse.json(tables);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseId = Number(id);
  if (!Number.isInteger(baseId) || baseId <= 0) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body as { name?: unknown })?.name;
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Field 'name' is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const table = createTable(baseId, name.trim());
  return NextResponse.json(table, { status: 201 });
}

/** Bulk delete tables: DELETE /api/bases/{id}/tables { ids: [1,2] } */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseId = Number(id);
  if (!Number.isInteger(baseId) || baseId <= 0) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
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
  for (const tId of ids) {
    if (typeof tId !== "number" || !Number.isInteger(tId) || tId <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(tId)}` },
        { status: 400 }
      );
    }
  }

  const result = deleteTables(ids);
  return NextResponse.json(result);
}
