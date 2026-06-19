import { NextRequest, NextResponse } from "next/server";
import { getBaseSchema } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /api/bases/{id}/schema
 * Returns the complete structural map of a base: every table, every column
 * (with parsed config, options, primary flag), all inter-table relationships,
 * and per-table row counts. No row/cell data is included.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const baseId = parseId(id);
  if (baseId === null) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
      { status: 400 }
    );
  }

  const schema = getBaseSchema(baseId);
  if (!schema) {
    return NextResponse.json({ error: `Base ${baseId} not found` }, { status: 404 });
  }

  return NextResponse.json(schema);
}
