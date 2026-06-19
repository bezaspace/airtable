# Progress

## Overview

Built a dark-themed Airtable MVP in this folder. It supports multiple bases, tables per base, dynamic typed columns, rows, and inline cell editing. Everything is backed by a local SQLite database.

## Tech stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- SQLite via `better-sqlite3`
- Route Handlers (REST API under `/api`) for all mutations — consumed by both the web UI and the CLI

## What works

- Create and delete bases from the sidebar
- Create and delete tables within a base
- Add/remove columns with `TEXT` or `NUMBER` types
- Add/remove rows
- Inline cell editing (click a cell, type, press Enter or blur to save)
- URL-driven table selection (`?base=X&table=Y`)
- Dark theme only (forced via `dark` class on `<html>`)
- Mock data seeding script (`scripts/seed.js`)
- **CLI** (`cli/`) — machine-readable JSON interface for AI coding agents (OpenCode, Claude Code, etc.)

## Key design decisions

- **SQLite schema**: Uses `bases`, `tables`, `columns`, `rows`, and `cells`. Columns are stored as metadata, so adding/removing columns does not require `ALTER TABLE`.
- **Server-side data fetching**: The root page loads the selected base/table from the URL and fetches the matching table data on the server via `queries.ts`.
- **Client-side interactivity**: Sidebar and grid are client components. They call the typed `api-client.ts` (HTTP to `/api`) for mutations and refresh their own state.
- **Shared query layer**: `src/lib/queries.ts` holds the pure DB functions. Route Handlers (`src/app/api/**`) are the HTTP skin over it; `page.tsx` imports `queries.ts` directly (no HTTP roundtrip on the server).
- **Grid remount on table switch**: The grid receives `key={tableId}` so its internal state resets when the user switches tables. This fixes stale-data issues when navigating via the sidebar.
- **shadcn/ui base-ui compatibility**: The default `DropdownMenuTrigger` did not expose `asChild`, so it was extended to map `asChild` to base-ui's `render` prop to avoid nested buttons.

## How to run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The database is created automatically at `./data/airtable.db`.

To re-seed with mock data:

```bash
node scripts/seed.js
```

## CLI (for AI coding agents)

A machine-readable CLI lives in `cli/`. It talks to the app over HTTP (Route Handlers under `/api`), so the Next.js server must be running. Supports **bulk operations** and **column-name addressing** so agents can fill entire tables in a few calls.

```bash
npm run dev          # start the server (in another terminal)
npx airtable help    # list all commands
npx airtable bases list
npx airtable tables get --id 1                      # rows as { rowId, ...colName: value }
npx airtable rows create --table-id 1 --data '{"Name":"Widget","Price":"9.99"}'   # row + cells in one call
npx airtable rows create-many --table-id 1 --rows '[{"Name":"A"},{"Name":"B"}]'   # bulk
npx airtable cells set --row-id 1 --column "Name" --value "hello"                 # by column name
npx airtable cells set-many --table-id 1 --updates '[{"rowId":1,"column":"Name","value":"x"}]'  # bulk
npx airtable tables get-many --ids 1,2,3            # bulk get
npx airtable rows delete-many --table-id 1 --ids 5,6,7   # bulk delete
```

- **Output**: always JSON on stdout. Errors are JSON on stderr with a non-zero exit code.
- **Exit codes**: `0` success, `1` general, `2` network (server unreachable), `3` validation/4xx, `4` not found, `5` server/5xx.
- **Server URL**: override with `AIRTABLE_URL` env var (default `http://localhost:3000`).
- **Canonical invocation**: `npx airtable <command>` (clean stdout). `npm run cli -- <command>` also works but npm prints banner lines to stdout that break JSON parsing — prefer `npx airtable`.
- **Bulk operations**: `rows create-many`, `cells set-many`, `columns create-many`, `tables get-many`, `*-delete-many` — all accept JSON arrays to do in one call what used to take dozens.
- **Column-name addressing**: `cells set --column "Price"`, `rows create --data '{"Price":"9.99"}'` — use column names instead of numeric ids.

## Notes for the engineer

- Read `src/lib/db.ts` for the schema and connection setup.
- Read `src/lib/queries.ts` for the pure DB functions (the real logic).
- Read `src/app/api/**/route.ts` for the Route Handlers (HTTP layer over `queries.ts`).
- Read `src/lib/api-client.ts` for the typed fetch wrappers used by client components.
- Read `cli/cli.ts` and `cli/client.ts` for the CLI.
- Read `src/app/page.tsx` to see how the selected base/table is resolved and passed down.
- Read `src/components/app-sidebar.tsx` and `src/components/table-grid.tsx` for the UI logic and state management.
