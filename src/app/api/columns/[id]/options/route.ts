import { NextRequest, NextResponse } from "next/server";
import { listColumnOptions, addColumnOption, deleteColumnOption, getColumn } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** GET /api/columns/{id}/options — list options for a SELECT/MULTI_SELECT column. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const columnId = parseId(id);
  if (columnId === null) {
    return NextResponse.json(
      { error: "Column id must be a positive integer" },
      { status: 400 }
    );
  }

  const col = getColumn(columnId);
  if (!col) {
    return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
  }
  if (col.type !== "SELECT" && col.type !== "MULTI_SELECT") {
    return NextResponse.json(
      { error: `Column ${columnId} is of type ${col.type}, not SELECT/MULTI_SELECT` },
      { status: 400 }
    );
  }

  return NextResponse.json(listColumnOptions(columnId));
}

/**
 * POST /api/columns/{id}/options
 * Body: { value: string, color?: string | null }
 * Adds a single option.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const columnId = parseId(id);
  if (columnId === null) {
    return NextResponse.json(
      { error: "Column id must be a positive integer" },
      { status: 400 }
    );
  }

  const col = getColumn(columnId);
  if (!col) {
    return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
  }
  if (col.type !== "SELECT" && col.type !== "MULTI_SELECT") {
    return NextResponse.json(
      { error: `Column ${columnId} is of type ${col.type}, not SELECT/MULTI_SELECT` },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as { value?: unknown; color?: unknown };
  if (typeof b.value !== "string" || !b.value.trim()) {
    return NextResponse.json(
      { error: "Field 'value' is required and must be a non-empty string" },
      { status: 400 }
    );
  }
  const color =
    b.color === null || b.color === undefined
      ? null
      : typeof b.color === "string"
        ? b.color
        : null;

  try {
    const opt = addColumnOption(columnId, b.value.trim(), color);
    return NextResponse.json(opt, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to add option" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/columns/{id}/options
 * Body: { optionId: number }  — delete a specific option by id
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const columnId = parseId(id);
  if (columnId === null) {
    return NextResponse.json(
      { error: "Column id must be a positive integer" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const optionId = (body as { optionId?: unknown })?.optionId;
  if (typeof optionId !== "number" || !Number.isInteger(optionId) || optionId <= 0) {
    return NextResponse.json(
      { error: "Field 'optionId' is required and must be a positive integer" },
      { status: 400 }
    );
  }

  deleteColumnOption(optionId);
  return new NextResponse(null, { status: 204 });
}
