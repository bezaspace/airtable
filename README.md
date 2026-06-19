# Airtable Clone

A feature-rich Airtable clone built with Next.js 16, React 19, Route Handlers, and SQLite. Dark theme only. Includes a machine-readable CLI for AI coding agents.

## Features

### Core (MVP)
- Create, rename, and delete **bases**
- Create, rename, and delete **tables** within a base
- Add and remove **columns** with typed fields
- Add and remove **rows**
- Inline cell editing
- URL-driven table selection (`?base=X&table=Y`)
- Dark theme (forced via `dark` class on `<html>`)
- Mock data seeding script (`scripts/seed.js`)
- **CLI** (`cli/`) — machine-readable JSON interface for AI coding agents

### Field Types
- `TEXT` — single-line text
- `NUMBER` — numeric values
- `LONG_TEXT` — multi-line text (Ctrl+Enter to save)
- `CHECKBOX` — boolean (toggle on click)
- `SELECT` — single-select dropdown with colored options
- `MULTI_SELECT` — multi-select with toggleable chips
- `DATE` — date picker
- `URL` — rendered as clickable link
- `EMAIL` — rendered as mailto link
- `LINK` — relationship to rows in another table (many-to-many)
- `LOOKUP` — read-only, pulls a field from linked rows
- `ROLLUP` — read-only aggregate over linked rows (count, sum, min, max, avg, join)

### Grid Operations
- **Column resizing** — drag the right edge of any column header (60–800px, persisted)
- **Column reordering** — drag and drop column headers
- **Column renaming** — click the column name in the header
- **Table renaming** — click the table name in the toolbar
- **Sort** — click the sort icon in any column header (asc / desc / none)
- **Filter** — per-column "contains" filters + global search across all fields
- **Primary field** — one column per table is marked primary; its value is the row label shown in link chips. Set via the column dropdown menu.

### Relationships
- **Linked records** (`LINK` columns) connect rows across tables. The cell UI shows chips with the target row's primary-field label and a searchable picker to add/remove links.
- **Lookup** columns pull a field value from the first linked row.
- **Rollup** columns aggregate a field across all linked rows (count, sum, min, max, average, join).

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui (base-ui primitives)
- better-sqlite3
- tsx (CLI runtime)

## Getting Started

Install dependencies (already done if you are reading this in the project):

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The SQLite database is created automatically at `./data/airtable.db` on first run.

To re-seed with mock data (includes linked records, lookups, rollups, and select fields):

```bash
node scripts/seed.js
```

## CLI (for AI coding agents)

The CLI (`cli/`) talks to the app over HTTP, so the server must be running. Output is always JSON on stdout; errors are JSON on stderr with a non-zero exit code.

```bash
npm run dev                    # start the server (separate terminal)
npx airtable help              # list all commands
npx airtable bases list
npx airtable tables get --id 1
npx airtable cells set --row-id 1 --column-id 1 --value "hello"
```

### New CLI commands

```bash
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

# Column options (SELECT / MULTI_SELECT)
npx airtable options list --column-id 8
npx airtable options add --column-id 8 --value "High" --color "#ef4444"
npx airtable options delete --column-id 8 --option-id 32

# Links (LINK column type)
npx airtable links add --link-column-id 11 --source-row-id 2 --target-row-id 3
npx airtable links remove --link-id 31
npx airtable links remove --link-column-id 11 --source-row-id 2 --target-row-id 3

# List all tables (for LINK target selection)
npx airtable tables list-all
```

Override the server URL with `AIRTABLE_URL` (default `http://localhost:3000`).

Exit codes: `0` success · `1` general · `2` network · `3` validation/4xx · `4` not found · `5` server/5xx.

> Prefer `npx airtable` over `npm run cli` — npm prints banner lines to stdout that break JSON parsing.

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run cli` - Run the CLI (prefer `npx airtable` for clean JSON output)

## Database Schema

- `bases` — top-level containers
- `tables` — belong to a base
- `columns` — typed fields with `width`, `is_primary`, `config` (JSON), and `sort_order`
- `rows` — belong to a table
- `cells` — EAV cell values (row_id + column_id → value)
- `column_options` — option list for SELECT / MULTI_SELECT columns (with optional color)
- `links` — many-to-many relationships between rows via LINK columns

The schema is auto-migrated on startup (additive ALTER TABLE + table recreation for constraint changes), so existing databases are upgraded in place.
