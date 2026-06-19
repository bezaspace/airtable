import { NextRequest, NextResponse } from "next/server";
import { deleteTables, listAllTables } from "@/lib/queries";

/**
 * GET /api/tables
 * Lists all tables across all bases (used for LINK column target selection).
 */
export async function GET() {
  return NextResponse.json(listAllTables());
}

/**
 * DELETE /api/tables { ids: [1,2,3] }
 * Bulk delete tables by id. Base id is not required.
 */
export async function DELETE(request: NextRequest) {
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
  for (const id of ids) {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(id)}` },
        { status: 400 }
      );
    }
  }

  const result = deleteTables(ids);
  return NextResponse.json(result);
}
