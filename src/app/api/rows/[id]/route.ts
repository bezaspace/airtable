import { NextRequest, NextResponse } from "next/server";
import { deleteRow } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isInteger(rowId) || rowId <= 0) {
    return NextResponse.json(
      { error: "Row id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteRow(rowId);
  return new NextResponse(null, { status: 204 });
}
