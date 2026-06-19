import { NextRequest, NextResponse } from "next/server";
import {
  deleteColumn,
  renameColumn,
  setColumnWidth,
  setColumnPrimary,
  getColumn,
} from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * PATCH /api/columns/{id}
 * Body: { name?: string, width?: number, isPrimary?: true }
 * Updates one or more of: name, width, primary flag.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const b = body as {
    name?: unknown;
    width?: unknown;
    isPrimary?: unknown;
  };

  try {
    if (typeof b.name === "string" && b.name.trim()) {
      const updated = renameColumn(columnId, b.name.trim());
      if (!updated) {
        return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
      }
    }

    if (typeof b.width === "number") {
      if (!Number.isFinite(b.width) || b.width < 60 || b.width > 800) {
        return NextResponse.json(
          { error: "width must be a number between 60 and 800" },
          { status: 400 }
        );
      }
      const updated = setColumnWidth(columnId, b.width);
      if (!updated) {
        return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
      }
    }

    if (b.isPrimary === true) {
      const updated = setColumnPrimary(columnId);
      if (!updated) {
        return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
      }
    }

    const final = getColumn(columnId);
    if (!final) {
      return NextResponse.json({ error: `Column ${columnId} not found` }, { status: 404 });
    }
    return NextResponse.json(final);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const columnId = parseId(id);
  if (columnId === null) {
    return NextResponse.json(
      { error: "Column id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteColumn(columnId);
  return new NextResponse(null, { status: 204 });
}
