import { NextRequest, NextResponse } from "next/server";
import {
  createColumn,
  deleteColumns,
  isValidColumnType,
  ensureColumnOptions,
  getColumn,
} from "@/lib/queries";
import type { ColumnType, ColumnConfig, LinkConfig, LookupConfig, RollupConfig } from "@/lib/types";
import { COMPUTED_TYPES } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Validate and coerce a config object for a given column type.
 * Throws Error with a user-facing message on failure.
 */
function validateConfig(type: ColumnType, raw: unknown): ColumnConfig {
  if (type === "LINK") {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("LINK columns require a 'config' object with targetTableId");
    }
    const cfg = raw as { targetTableId?: unknown };
    if (typeof cfg.targetTableId !== "number" || !Number.isInteger(cfg.targetTableId) || cfg.targetTableId <= 0) {
      throw new Error("LINK config.targetTableId must be a positive integer");
    }
    return { targetTableId: cfg.targetTableId } as LinkConfig;
  }

  if (type === "LOOKUP") {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("LOOKUP columns require a 'config' object with linkColumnId and targetColumnId");
    }
    const cfg = raw as { linkColumnId?: unknown; targetColumnId?: unknown };
    if (typeof cfg.linkColumnId !== "number" || !Number.isInteger(cfg.linkColumnId) || cfg.linkColumnId <= 0) {
      throw new Error("LOOKUP config.linkColumnId must be a positive integer");
    }
    if (typeof cfg.targetColumnId !== "number" || !Number.isInteger(cfg.targetColumnId) || cfg.targetColumnId <= 0) {
      throw new Error("LOOKUP config.targetColumnId must be a positive integer");
    }
    return { linkColumnId: cfg.linkColumnId, targetColumnId: cfg.targetColumnId } as LookupConfig;
  }

  if (type === "ROLLUP") {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("ROLLUP columns require a 'config' object with linkColumnId, targetColumnId, and aggregation");
    }
    const cfg = raw as {
      linkColumnId?: unknown;
      targetColumnId?: unknown;
      aggregation?: unknown;
    };
    if (typeof cfg.linkColumnId !== "number" || !Number.isInteger(cfg.linkColumnId) || cfg.linkColumnId <= 0) {
      throw new Error("ROLLUP config.linkColumnId must be a positive integer");
    }
    if (typeof cfg.targetColumnId !== "number" || !Number.isInteger(cfg.targetColumnId) || cfg.targetColumnId <= 0) {
      throw new Error("ROLLUP config.targetColumnId must be a positive integer");
    }
    const validAgg = ["count", "sum", "min", "max", "avg", "join"];
    if (typeof cfg.aggregation !== "string" || !validAgg.includes(cfg.aggregation)) {
      throw new Error(`ROLLUP config.aggregation must be one of: ${validAgg.join(", ")}`);
    }
    return {
      linkColumnId: cfg.linkColumnId,
      targetColumnId: cfg.targetColumnId,
      aggregation: cfg.aggregation as RollupConfig["aggregation"],
    } as RollupConfig;
  }

  // Scalar types don't need config
  return null;
}

/**
 * POST /api/tables/{id}/columns
 *  - { name, type, config?, options?: string[] } → create one column
 *  - { columns: [ { name, type, config?, options? }, ... ] } → create many (bulk)
 *
 * For SELECT / MULTI_SELECT, pass `options: ["Red","Green","Blue"]` to seed
 * the option list in the same call.
 *
 * For LINK / LOOKUP / ROLLUP, pass `config` (see validateConfig).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = parseId(id);
  if (tableId === null) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    name?: unknown;
    type?: unknown;
    config?: unknown;
    options?: unknown;
    columns?: unknown;
  };

  // Helper to create one column with full validation
  function createOne(
    tableId: number,
    c: {
      name?: unknown;
      type?: unknown;
      config?: unknown;
      options?: unknown;
    }
  ): { col: ReturnType<typeof createColumn>; options?: ReturnType<typeof ensureColumnOptions> } {
    if (typeof c.name !== "string" || !c.name.trim()) {
      throw new Error("Field 'name' is required and must be a non-empty string");
    }
    if (typeof c.type !== "string" || !isValidColumnType(c.type)) {
      throw new Error(`Field 'type' must be one of the supported column types, got: ${String(c.type)}`);
    }
    const type = c.type as ColumnType;

    let config: ColumnConfig = null;
    try {
      config = validateConfig(type, c.config);
    } catch (err) {
      throw err;
    }

    const col = createColumn(tableId, c.name.trim(), type, config ?? undefined);

    let options: ReturnType<typeof ensureColumnOptions> | undefined;
    if ((type === "SELECT" || type === "MULTI_SELECT") && Array.isArray(c.options)) {
      const optStrings = c.options
        .map((o) => (typeof o === "string" ? o.trim() : null))
        .filter((o): o is string => !!o);
      if (optStrings.length > 0) {
        options = ensureColumnOptions(col.id, optStrings);
      }
    }

    return { col, options };
  }

  try {
    // Bulk: { columns: [ ... ] }
    if (Array.isArray(b.columns)) {
      if (b.columns.length === 0) {
        return NextResponse.json(
          { error: "Field 'columns' must be a non-empty array" },
          { status: 400 }
        );
      }
      const results = (b.columns as typeof b[]).map((c, i) => {
        try {
          return createOne(tableId, c);
        } catch (err) {
          throw new Error(`columns[${i}]: ${(err as Error).message}`);
        }
      });
      return NextResponse.json(results.map((r) => r.col), { status: 201 });
    }

    // Single column
    const { col, options } = createOne(tableId, b);
    const full = getColumn(col.id)!;
    return NextResponse.json({ ...full, options: options ?? undefined }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to create column" },
      { status: 400 }
    );
  }
}

/** Bulk delete columns: DELETE /api/tables/{id}/columns { ids: [1,2,3] } */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const tableId = parseId(id);
  if (tableId === null) {
    return NextResponse.json(
      { error: "Table id must be a positive integer" },
      { status: 400 }
    );
  }

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
  for (const cId of ids) {
    if (typeof cId !== "number" || !Number.isInteger(cId) || cId <= 0) {
      return NextResponse.json(
        { error: `Each id must be a positive integer, got: ${JSON.stringify(cId)}` },
        { status: 400 }
      );
    }
  }

  const result = deleteColumns(ids);
  return NextResponse.json(result);
}

// Re-export for type-narrowing in other modules
export { COMPUTED_TYPES };
