import { NextRequest, NextResponse } from "next/server";
import { deleteBase, renameBase } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH /api/bases/{id} { name: string } — rename a base. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const idNum = parseId(id);
  if (idNum === null) {
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

  const updated = renameBase(idNum, name.trim());
  if (!updated) {
    return NextResponse.json({ error: `Base ${idNum} not found` }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const idNum = parseId(id);
  if (idNum === null) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteBase(idNum);
  return new NextResponse(null, { status: 204 });
}
