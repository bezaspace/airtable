import { NextRequest, NextResponse } from "next/server";
import { listBases, createBase, deleteBases } from "@/lib/queries";

export async function GET() {
  const bases = listBases();
  return NextResponse.json(bases);
}

export async function POST(request: NextRequest) {
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

  const base = createBase(name.trim());
  return NextResponse.json(base, { status: 201 });
}

/** Bulk delete bases: POST /api/bases/delete { ids: [1,2,3] } */
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

  const result = deleteBases(ids);
  return NextResponse.json(result);
}
