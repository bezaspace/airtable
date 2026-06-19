import { NextRequest, NextResponse } from "next/server";
import { deleteBase } from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json(
      { error: "Base id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteBase(idNum);
  return new NextResponse(null, { status: 204 });
}
