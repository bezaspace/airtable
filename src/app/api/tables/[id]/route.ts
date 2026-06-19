import { NextRequest, NextResponse } from "next/server";
import {
  getTableData,
  getTableDataFormatted,
  deleteTable,
} from "@/lib/queries";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "rows";
  if (format !== "rows" && format !== "raw") {
    return NextResponse.json(
      { error: "Query param 'format' must be 'rows' or 'raw'" },
      { status: 400 }
    );
  }

  const data =
    format === "rows"
      ? getTableDataFormatted(tableId)
      : getTableData(tableId);

  if (!data) {
    return NextResponse.json(
      { error: `Table ${tableId} not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = Number(id);
  if (!Number.isInteger(tableId) || tableId <= 0) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  deleteTable(tableId);
  return new NextResponse(null, { status: 204 });
}
