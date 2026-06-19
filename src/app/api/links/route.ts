import { NextRequest, NextResponse } from "next/server";
import { addLink, removeLink, removeLinkByEnds, getColumn } from "@/lib/queries";

function parsePositiveInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    return null;
  }
  return v;
}

/**
 * POST /api/links
 * Body: { linkColumnId, sourceRowId, targetRowId }
 * Creates a link between two rows via a LINK column.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    linkColumnId?: unknown;
    sourceRowId?: unknown;
    targetRowId?: unknown;
  };

  const linkColumnId = parsePositiveInt(b.linkColumnId);
  const sourceRowId = parsePositiveInt(b.sourceRowId);
  const targetRowId = parsePositiveInt(b.targetRowId);

  if (linkColumnId === null) {
    return NextResponse.json(
      { error: "Field 'linkColumnId' is required and must be a positive integer" },
      { status: 400 }
    );
  }
  if (sourceRowId === null) {
    return NextResponse.json(
      { error: "Field 'sourceRowId' is required and must be a positive integer" },
      { status: 400 }
    );
  }
  if (targetRowId === null) {
    return NextResponse.json(
      { error: "Field 'targetRowId' is required and must be a positive integer" },
      { status: 400 }
    );
  }

  // Validate the column is a LINK column
  const col = getColumn(linkColumnId);
  if (!col) {
    return NextResponse.json({ error: `Column ${linkColumnId} not found` }, { status: 404 });
  }
  if (col.type !== "LINK") {
    return NextResponse.json(
      { error: `Column ${linkColumnId} is of type ${col.type}, not LINK` },
      { status: 400 }
    );
  }

  try {
    const link = addLink(linkColumnId, sourceRowId, targetRowId);
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to create link" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/links
 * Body: { linkId: number }                          — delete by link id
 *    OR { linkColumnId, sourceRowId, targetRowId }  — delete by ends
 */
export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    linkId?: unknown;
    linkColumnId?: unknown;
    sourceRowId?: unknown;
    targetRowId?: unknown;
  };

  // By link id
  const linkId = parsePositiveInt(b.linkId);
  if (linkId !== null) {
    removeLink(linkId);
    return new NextResponse(null, { status: 204 });
  }

  // By ends
  const linkColumnId = parsePositiveInt(b.linkColumnId);
  const sourceRowId = parsePositiveInt(b.sourceRowId);
  const targetRowId = parsePositiveInt(b.targetRowId);

  if (linkColumnId === null || sourceRowId === null || targetRowId === null) {
    return NextResponse.json(
      { error: "Provide either 'linkId' or all of 'linkColumnId', 'sourceRowId', 'targetRowId'" },
      { status: 400 }
    );
  }

  removeLinkByEnds(linkColumnId, sourceRowId, targetRowId);
  return new NextResponse(null, { status: 204 });
}
