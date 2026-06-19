import { NextRequest, NextResponse } from "next/server";
import { getTablesBulk } from "@/lib/queries";

/**
 * POST /api/tables/bulk { ids: [1,2,3], format: "rows"|"raw" }
 * Get data for many tables in one call.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as { ids?: unknown; format?: unknown };
  if (!Array.isArray(b.ids) || b.ids.length === 0) {
    return NextResponse.json(
      { error: "Field 'ids' must be a non-empty array of positive integers" },
      { status: 400 }
    );
  }
  for (const id of b.ids) {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(id)}` },
        { status: 400 }
      );
    }
  }

  const format = typeof b.format === "string" && b.format === "raw" ? "raw" : "rows";
  const results = getTablesBulk(b.ids as number[], format);
  return NextResponse.json(results);
}
