import { NextRequest, NextResponse } from "next/server";
import { deleteColumn } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const columnId = Number(id);
  if (!Number.isInteger(columnId) || columnId <= 0) {
    return NextResponse.json(
      { error: "Column id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteColumn(columnId);
  return new NextResponse(null, { status: 204 });
}
