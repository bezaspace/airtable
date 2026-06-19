# Progress

## Overview

A dark-themed Airtable clone with typed fields, relationships, computed columns, and full grid operations (sort, filter, resize, reorder, rename). Backed by a local SQLite database with an EAV cell model. Includes a machine-readable CLI for AI coding agents.

## Tech stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- SQLite via `better-sqlite3`
- Route Handlers (REST API under `/api`) for all mutations — consumed by both the web UI and the CLI

## What works

### Core
- Create, rename, and delete **bases**
- Create, rename, and delete **tables** within a base
- Add and remove **columns** with 12 typed field types
- Add and remove **rows**
- Inline cell editing (type-specific editors per field type)
- URL-driven table selection (`?base=X&table=Y`)
- Dark theme only (forced via `dark` class on `<html>`)
- Mock data seeding script (`scripts/seed.js`) with linked records, lookups, rollups, and select fields
- **CLI** (`cli/`) — machine-readable JSON interface for AI coding agents

### Field types (12)
- `TEXT`, `NUMBER` — original scalar types
- `LONG_TEXT` — multi-line text editor (Ctrl+Enter to save)
- `CHECKBOX` — boolean, toggles on click
- `SELECT` — single-select dropdown with colored options
- `MULTI_SELECT` — multi-select with toggleable chips
- `DATE` — native date picker
- `URL` — rendered as clickable link
- `EMAIL` — rendered as mailto link
- `LINK` — relationship to rows in another table (many-to-many via `links` table)
- `LOOKUP` — read-only, pulls a field from linked rows
- `ROLLUP` — read-only aggregate over linked rows (count, sum, min, max, avg, join)

### Grid operations
- **Column resizing** — drag the right edge of any column header (60–800px, persisted to DB)
- **Column reordering** — drag and drop column headers (updates `sort_order`)
- **Column renaming** — click the column name in the header (inline edit)
- **Table renaming** — click the table name in the toolbar (inline edit)
- **Sort** — click the sort icon in any column header (asc / desc / none, numeric-aware for NUMBER/ROLLUP)
- **Filter** — per-column "contains" filters + global search across all scalar/link/computed fields
- **Primary field** — one column per table is marked primary; its value is the row label shown in link chips. Set via the column dropdown menu. First column auto-becomes primary.

### Relationships
- **Linked records** (`LINK` columns) connect rows across tables. The cell UI shows chips with the target row's primary-field label and a searchable picker to add/remove links.
- **Lookup** columns pull a field value from the first linked row.
- **Rollup** columns aggregate a field across all linked rows.

## Key design decisions

- **SQLite schema**: Uses `bases`, `tables`, `columns`, `rows`, `cells`, `column_options`, and `links`. Columns are stored as metadata (EAV pattern), so adding/removing columns does not require `ALTER TABLE`. The `columns` table has `width`, `is_primary`, `config` (JSON), and `sort_order` fields.
- **Auto-migration**: `db.ts` runs idempotent additive migrations on startup (ALTER TABLE for new columns, table recreation to remove the old `CHECK(type IN ('TEXT','NUMBER'))` constraint so new field types are accepted). Existing databases are upgraded in place.
- **Config JSON**: LINK/LOOKUP/ROLLUP columns store their configuration as JSON in `columns.config` (e.g. `{"targetTableId":3}` for LINK, `{"linkColumnId":11,"targetColumnId":4,"aggregation":"sum"}` for ROLLUP).
- **Resolved table data**: `getTableData()` returns a rich payload with resolved options, links (with target row labels), and computed column values — so the UI gets everything in one call.
- **Server-side data fetching**: The root page loads the selected base/table from the URL and fetches the matching table data on the server via `queries.ts`.
- **Client-side interactivity**: Sidebar and grid are client components. They call the typed `api-client.ts` (HTTP to `/api`) for mutations and refresh their own state.
- **Grid remount on table switch**: The grid receives `key={tableId}` so its internal state resets when the user switches tables.
- **Target row caching**: The `linked-cell.tsx` module caches target-table rows per table id for the lifetime of the grid, so link pickers don't re-fetch on every open.

## How to run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The database is created automatically at `./data/airtable.db`.

To re-seed with mock data (includes linked records, lookups, rollups, and select fields):

```bash
node scripts/seed.js
```

## CLI (for AI coding agents)

A machine-readable CLI lives in `cli/`. It talks to the app over HTTP (Route Handlers under `/api`), so the Next.js server must be running. Supports **bulk operations**, **column-name addressing**, **all field types**, **relationships**, and **layout operations**.

```bash
npm run dev          # start the server (in another terminal)
npx airtable help    # list all commands

# Renaming
npx airtable bases rename --id 1 --name "New Name"
npx airtable tables rename --id 2 --name "New Name"
npx airtable columns rename --id 6 --name "New Name"

# Column layout
npx airtable columns set-width --id 6 --width 280
npx airtable columns set-primary --id 6
npx airtable columns reorder --table-id 2 --order 5,3,1,2,4

# Field types (with config + options)
npx airtable columns create --table-id 2 --name "Status" --type SELECT --options '["Todo","Done"]'
npx airtable columns create --table-id 2 --name "Owner" --type LINK --config '{"targetTableId":3}'
npx airtable columns create --table-id 2 --name "Total" --type ROLLUP --config '{"linkColumnId":11,"targetColumnId":4,"aggregation":"sum"}'

# Column options
npx airtable options list --column-id 8
npx airtable options add --column-id 8 --value "High" --color "#ef4444"
npx airtable options delete --column-id 8 --option-id 32

# Links
npx airtable links add --link-column-id 11 --source-row-id 2 --target-row-id 3
npx airtable links remove --link-id 31
npx airtable links remove --link-column-id 11 --source-row-id 2 --target-row-id 3

# Bulk + column-name addressing (original MVP features, still supported)
npx airtable rows create --table-id 1 --data '{"Name":"Widget","Price":"9.99"}'
npx airtable rows create-many --table-id 1 --rows '[{"Name":"A"},{"Name":"B"}]'
npx airtable cells set --row-id 1 --column "Name" --value "hello"
npx airtable cells set-many --table-id 1 --updates '[{"rowId":1,"column":"Name","value":"x"}]'
npx airtable tables get-many --ids 1,2,3
npx airtable rows delete-many --table-id 1 --ids 5,6,7
```

- **Output**: always JSON on stdout. Errors are JSON on stderr with a non-zero exit code.
- **Exit codes**: `0` success, `1` general, `2` network (server unreachable), `3` validation/4xx, `4` not found, `5` server/5xx.
- **Server URL**: override with `AIRTABLE_URL` env var (default `http://localhost:3000`).
- **Canonical invocation**: `npx airtable <command>` (clean stdout).

## Notes for the engineer

- Read `src/lib/db.ts` for the schema, migrations, and connection setup.
- Read `src/lib/types.ts` for all field types, config interfaces, and resolved data shapes.
- Read `src/lib/queries.ts` for the pure DB functions (the real logic) — including computed column evaluation.
- Read `src/app/api/**/route.ts` for the Route Handlers (HTTP layer over `queries.ts`).
- Read `src/lib/api-client.ts` for the typed fetch wrappers used by client components.
- Read `cli/cli.ts` and `cli/client.ts` for the CLI.
- Read `src/app/page.tsx` to see how the selected base/table is resolved and passed down.
- Read `src/components/app-sidebar.tsx` for the sidebar UI.
- Read `src/components/table-grid.tsx` for the grid UI (resize, reorder, sort, filter, rename, all field-type rendering).
- Read `src/components/editable-cell.tsx` for per-type cell editors.
- Read `src/components/linked-cell.tsx` for the linked-records cell UI and target-row caching.
