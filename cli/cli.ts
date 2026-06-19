#!/usr/bin/env tsx
/**
 * Airtable CLI — machine-readable interface to the Airtable app.
 *
 * Output is always JSON on stdout. Errors are JSON on stderr with a
 * non-zero exit code. Designed for AI coding agents (OpenCode, Claude
 * Code, etc.) to control the app over HTTP.
 *
 * Requires the Next.js server to be running (npm run dev or npm start).
 * Override the server URL with the AIRTABLE_URL env var.
 */

import { parseArgs } from "util";
import {
  client,
  ApiError,
  type RowInput,
  type CellUpdateInput,
  type ColumnType,
} from "./client";

// ---------------------------------------------------------------------------
// Exit codes (frozen contract — additive only, never reuse a code)
// ---------------------------------------------------------------------------
const EXIT_OK = 0;
const EXIT_GENERAL = 1;
const EXIT_NETWORK = 2; // server unreachable
const EXIT_VALIDATION = 3; // bad CLI args or 4xx from server
const EXIT_NOT_FOUND = 4; // resource not found
const EXIT_SERVER = 5; // 5xx from server

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function fail(message: string, code: string, exitCode: number): never {
  process.stderr.write(JSON.stringify({ error: message, code }) + "\n");
  process.exit(exitCode);
}

function handleError(err: unknown): never {
  if (err instanceof ApiError) {
    const exit =
      err.code === "network"
        ? EXIT_NETWORK
        : err.code === "not_found"
          ? EXIT_NOT_FOUND
          : err.code === "validation"
            ? EXIT_VALIDATION
            : EXIT_SERVER;
    fail(err.message, err.code, exit);
  }
  fail((err as Error).message ?? String(err), "unexpected", EXIT_GENERAL);
}

/** Parse a positive integer CLI arg, or fail with a validation error. */
function parseIntArg(name: string, raw: string | undefined): number {
  if (raw === undefined) fail(`Missing required argument: ${name}`, "missing_arg", EXIT_VALIDATION);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    fail(`${name} must be a positive integer, got: ${raw}`, "bad_arg", EXIT_VALIDATION);
  }
  return n;
}

/** Parse a comma-separated list of positive integers. */
function parseIntListArg(name: string, raw: string | undefined): number[] {
  if (raw === undefined) fail(`Missing required argument: ${name}`, "missing_arg", EXIT_VALIDATION);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    fail(`${name} must be a comma-separated list of positive integers`, "bad_arg", EXIT_VALIDATION);
  }
  const ids: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) {
      fail(`${name} contains invalid id: ${p} (must be positive integer)`, "bad_arg", EXIT_VALIDATION);
    }
    ids.push(n);
  }
  return ids;
}

/** Parse a JSON object/array from a string arg. */
function parseJsonArg(name: string, raw: string | undefined): unknown {
  if (raw === undefined) fail(`Missing required argument: ${name}`, "missing_arg", EXIT_VALIDATION);
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${name} is not valid JSON: ${(e as Error).message}`, "bad_arg", EXIT_VALIDATION);
  }
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------
type Command = {
  name: string;
  summary: string;
  usage: string;
  run: (args: string[]) => Promise<void>;
};

const commands: Command[] = [
  // --- bases -------------------------------------------------------------
  {
    name: "bases list",
    summary: "List all bases.",
    usage: "airtable bases list",
    run: async () => out(await client.listBases()),
  },
  {
    name: "bases create",
    summary: "Create a new base.",
    usage: 'airtable bases create --name "My Base"',
    run: async (args) => {
      const { values } = parseArgs({ args, options: { name: { type: "string" } }, strict: true });
      if (!values.name) fail("--name is required", "missing_arg", EXIT_VALIDATION);
      out(await client.createBase(values.name));
    },
  },
  {
    name: "bases delete",
    summary: "Delete one base by id (cascades to its tables).",
    usage: "airtable bases delete --id <id>",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { id: { type: "string" } }, strict: true });
      const id = parseIntArg("--id", values.id);
      await client.deleteBase(id);
      out({ deleted: true, id });
    },
  },
  {
    name: "bases delete-many",
    summary: "Delete multiple bases by id (bulk). Returns { deleted, missing }.",
    usage: "airtable bases delete-many --ids 1,2,3",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { ids: { type: "string" } }, strict: true });
      const ids = parseIntListArg("--ids", values.ids);
      out(await client.deleteBases(ids));
    },
  },

  // --- tables ------------------------------------------------------------
  {
    name: "tables list",
    summary: "List tables in a base.",
    usage: "airtable tables list --base-id <id>",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { "base-id": { type: "string" } }, strict: true });
      const baseId = parseIntArg("--base-id", values["base-id"]);
      out(await client.listTables(baseId));
    },
  },
  {
    name: "tables get",
    summary: "Get a table's full data. --format rows (default) returns rows as { rowId, ...colName: value }; --format raw returns the EAV cell map.",
    usage: "airtable tables get --id <id> [--format rows|raw]",
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { id: { type: "string" }, format: { type: "string" } },
        strict: true,
      });
      const id = parseIntArg("--id", values.id);
      const format = values.format === "raw" ? "raw" : "rows";
      out(await client.getTable(id, format));
    },
  },
  {
    name: "tables get-many",
    summary: "Get data for multiple tables in one call (bulk). --format rows (default) or raw.",
    usage: "airtable tables get-many --ids 1,2,3 [--format rows|raw]",
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { ids: { type: "string" }, format: { type: "string" } },
        strict: true,
      });
      const ids = parseIntListArg("--ids", values.ids);
      const format = values.format === "raw" ? "raw" : "rows";
      out(await client.getTablesBulk(ids, format));
    },
  },
  {
    name: "tables create",
    summary: "Create a table in a base.",
    usage: 'airtable tables create --base-id <id> --name "Tasks"',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "base-id": { type: "string" }, name: { type: "string" } },
        strict: true,
      });
      const baseId = parseIntArg("--base-id", values["base-id"]);
      if (!values.name) fail("--name is required", "missing_arg", EXIT_VALIDATION);
      out(await client.createTable(baseId, values.name));
    },
  },
  {
    name: "tables delete",
    summary: "Delete one table by id (cascades to columns/rows/cells).",
    usage: "airtable tables delete --id <id>",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { id: { type: "string" } }, strict: true });
      const id = parseIntArg("--id", values.id);
      await client.deleteTable(id);
      out({ deleted: true, id });
    },
  },
  {
    name: "tables delete-many",
    summary: "Delete multiple tables by id (bulk). Returns { deleted, missing }.",
    usage: "airtable tables delete-many --ids 1,2,3",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { ids: { type: "string" } }, strict: true });
      const ids = parseIntListArg("--ids", values.ids);
      out(await client.deleteTables(ids));
    },
  },

  // --- columns -----------------------------------------------------------
  {
    name: "columns create",
    summary: "Add one column to a table. Type is TEXT or NUMBER.",
    usage: 'airtable columns create --table-id <id> --name "Due Date" --type TEXT',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, name: { type: "string" }, type: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      if (!values.name) fail("--name is required", "missing_arg", EXIT_VALIDATION);
      if (values.type !== "TEXT" && values.type !== "NUMBER") {
        fail("--type must be TEXT or NUMBER", "bad_arg", EXIT_VALIDATION);
      }
      out(await client.createColumn(tableId, values.name, values.type as ColumnType));
    },
  },
  {
    name: "columns create-many",
    summary: "Add multiple columns to a table in one call (bulk). --columns is a JSON array of { name, type }.",
    usage: 'airtable columns create-many --table-id <id> --columns \'[{"name":"Price","type":"NUMBER"},{"name":"SKU","type":"TEXT"}]\'',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, columns: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      const parsed = parseJsonArg("--columns", values.columns);
      if (!Array.isArray(parsed)) {
        fail("--columns must be a JSON array of { name, type } objects", "bad_arg", EXIT_VALIDATION);
      }
      const cols: { name: string; type: ColumnType }[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const c = parsed[i] as { name?: unknown; type?: unknown };
        if (typeof c?.name !== "string" || !c.name.trim()) {
          fail(`columns[${i}].name must be a non-empty string`, "bad_arg", EXIT_VALIDATION);
        }
        if (c?.type !== "TEXT" && c?.type !== "NUMBER") {
          fail(`columns[${i}].type must be TEXT or NUMBER`, "bad_arg", EXIT_VALIDATION);
        }
        cols.push({ name: c.name, type: c.type as ColumnType });
      }
      out(await client.createColumnsBulk(tableId, cols));
    },
  },
  {
    name: "columns delete",
    summary: "Delete one column by id (cascades to its cells).",
    usage: "airtable columns delete --id <id>",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { id: { type: "string" } }, strict: true });
      const id = parseIntArg("--id", values.id);
      await client.deleteColumn(id);
      out({ deleted: true, id });
    },
  },
  {
    name: "columns delete-many",
    summary: "Delete multiple columns by id (bulk). --table-id is required. Returns { deleted, missing }.",
    usage: "airtable columns delete-many --table-id <id> --ids 1,2,3",
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, ids: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      const ids = parseIntListArg("--ids", values.ids);
      out(await client.deleteColumns(tableId, ids));
    },
  },

  // --- rows --------------------------------------------------------------
  {
    name: "rows create",
    summary: "Create a row. With --data, sets cells by column name in one call. Without --data, creates an empty row.",
    usage: 'airtable rows create --table-id <id> [--data \'{"Name":"Widget","Price":"9.99"}\']',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, data: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      if (values.data === undefined) {
        out(await client.createRow(tableId));
      } else {
        const parsed = parseJsonArg("--data", values.data);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          fail("--data must be a JSON object keyed by column name", "bad_arg", EXIT_VALIDATION);
        }
        out(await client.createRowWithData(tableId, parsed as RowInput));
      }
    },
  },
  {
    name: "rows create-many",
    summary: "Create multiple rows with data in one call (bulk). --rows is a JSON array of objects keyed by column name.",
    usage: 'airtable rows create-many --table-id <id> --rows \'[{"Name":"A","Price":"1"},{"Name":"B","Price":"2"}]\'',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, rows: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      const parsed = parseJsonArg("--rows", values.rows);
      if (!Array.isArray(parsed)) {
        fail("--rows must be a JSON array of objects keyed by column name", "bad_arg", EXIT_VALIDATION);
      }
      for (let i = 0; i < parsed.length; i++) {
        if (typeof parsed[i] !== "object" || parsed[i] === null || Array.isArray(parsed[i])) {
          fail(`rows[${i}] must be an object keyed by column name`, "bad_arg", EXIT_VALIDATION);
        }
      }
      out(await client.createRowsWithData(tableId, parsed as RowInput[]));
    },
  },
  {
    name: "rows delete",
    summary: "Delete one row by id (cascades to its cells).",
    usage: "airtable rows delete --id <id>",
    run: async (args) => {
      const { values } = parseArgs({ args, options: { id: { type: "string" } }, strict: true });
      const id = parseIntArg("--id", values.id);
      await client.deleteRow(id);
      out({ deleted: true, id });
    },
  },
  {
    name: "rows delete-many",
    summary: "Delete multiple rows by id (bulk). --table-id is required. Returns { deleted, missing }.",
    usage: "airtable rows delete-many --table-id <id> --ids 1,2,3",
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, ids: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      const ids = parseIntListArg("--ids", values.ids);
      out(await client.deleteRows(tableId, ids));
    },
  },

  // --- cells -------------------------------------------------------------
  {
    name: "cells set",
    summary: "Set a single cell. Use --column <name> OR --column-id <id>. Use --value null to clear.",
    usage: 'airtable cells set --row-id <id> --column "Price" --value "9.99"\nairtable cells set --row-id <id> --column-id 4 --value null',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: {
          "row-id": { type: "string" },
          "column-id": { type: "string" },
          column: { type: "string" },
          value: { type: "string" },
        },
        strict: true,
      });
      const rowId = parseIntArg("--row-id", values["row-id"]);
      if (values.value === undefined) fail("--value is required (use null to clear)", "missing_arg", EXIT_VALIDATION);
      const value = values.value === "null" ? null : values.value;

      if (values.column !== undefined) {
        out(await client.updateCellByColumn(rowId, values.column, value));
      } else if (values["column-id"] !== undefined) {
        const colId = parseIntArg("--column-id", values["column-id"]);
        out(await client.updateCell(rowId, colId, value));
      } else {
        fail("Either --column <name> or --column-id <id> is required", "missing_arg", EXIT_VALIDATION);
      }
    },
  },
  {
    name: "cells set-many",
    summary: "Set multiple cells in one call (bulk). --updates is a JSON array of { rowId, column|columnId, value }. --table-id required.",
    usage: 'airtable cells set-many --table-id <id> --updates \'[{"rowId":1,"column":"Price","value":"9.99"},{"rowId":2,"column":"Stock","value":"50"}]\'',
    run: async (args) => {
      const { values } = parseArgs({
        args,
        options: { "table-id": { type: "string" }, updates: { type: "string" } },
        strict: true,
      });
      const tableId = parseIntArg("--table-id", values["table-id"]);
      const parsed = parseJsonArg("--updates", values.updates);
      if (!Array.isArray(parsed)) {
        fail("--updates must be a JSON array of { rowId, column|columnId, value }", "bad_arg", EXIT_VALIDATION);
      }
      const updates: CellUpdateInput[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const u = parsed[i] as CellUpdateInput & { value?: unknown };
        if (typeof u?.rowId !== "number" || !Number.isInteger(u.rowId) || u.rowId <= 0) {
          fail(`updates[${i}].rowId must be a positive integer`, "bad_arg", EXIT_VALIDATION);
        }
        if (u.column === undefined && u.columnId === undefined) {
          fail(`updates[${i}] must specify 'column' (name) or 'columnId'`, "bad_arg", EXIT_VALIDATION);
        }
        updates.push({
          rowId: u.rowId,
          column: typeof u.column === "string" ? u.column : undefined,
          columnId: typeof u.columnId === "number" ? u.columnId : undefined,
          value: (u.value ?? null) as string | number | null,
        });
      }
      out(await client.updateCellsBulk(tableId, updates));
    },
  },

  // --- help --------------------------------------------------------------
  {
    name: "help",
    summary: "List all commands.",
    usage: "airtable help",
    run: async () =>
      out(
        commands.map((c) => ({ name: c.name, summary: c.summary, usage: c.usage }))
      ),
  },
];

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
function printHelp(): void {
  const help = {
    name: "airtable",
    description: "Machine-readable CLI for the Airtable app.",
    output: "All output is JSON on stdout. Errors are JSON on stderr.",
    environment: {
      AIRTABLE_URL: "Server base URL (default: http://localhost:3000)",
    },
    exitCodes: {
      0: "success",
      1: "general error",
      2: "network error (server unreachable)",
      3: "validation error (bad args or 4xx)",
      4: "not found",
      5: "server error (5xx)",
    },
    bulkOperations: {
      "rows create-many": "Create many rows with data in one call (--rows JSON array)",
      "cells set-many": "Set many cells in one call (--updates JSON array, --table-id)",
      "columns create-many": "Create many columns in one call (--columns JSON array)",
      "tables get-many": "Get many tables' data in one call (--ids)",
      "bases delete-many": "Delete many bases (--ids)",
      "tables delete-many": "Delete many tables (--ids)",
      "columns delete-many": "Delete many columns (--table-id, --ids)",
      "rows delete-many": "Delete many rows (--table-id, --ids)",
    },
    columnNameAddressing:
      "cells set and cells set-many accept --column <name> as an alternative to --column-id <id>. rows create --data and rows create-many key values by column name.",
    commands: commands.map((c) => ({ name: c.name, summary: c.summary, usage: c.usage })),
  };
  out(help);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    printHelp();
    process.exit(EXIT_OK);
  }

  // Match the longest command name (e.g. "bases list" before "bases").
  const sorted = [...commands].sort((a, b) => b.name.length - a.name.length);
  const matched = sorted.find((cmd) => {
    const parts = cmd.name.split(" ");
    return parts.every((p, i) => argv[i] === p);
  });

  if (!matched) {
    fail(
      `Unknown command: ${argv.join(" ")}. Run 'airtable help' for available commands.`,
      "unknown_command",
      EXIT_VALIDATION
    );
  }

  const rest = argv.slice(matched.name.split(" ").length);
  try {
    await matched.run(rest);
    process.exit(EXIT_OK);
  } catch (err) {
    handleError(err);
  }
}

main();
