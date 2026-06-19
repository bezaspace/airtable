# Airtable Clone

A simple Airtable clone built with Next.js 16, React 19, Route Handlers, and SQLite. Dark theme only. Includes a machine-readable CLI for AI coding agents.

## Features

- Create, rename (via deletion/recreation), and delete **bases**
- Create and delete **tables** within a base
- Add and remove **columns** with `TEXT` or `NUMBER` types
- Add and remove **rows**
- Inline cell editing
- Airtable-inspired dark spreadsheet UI
- **CLI** for AI coding agents (OpenCode, Claude Code, etc.) — JSON in/out over HTTP

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
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

## CLI (for AI coding agents)

The CLI (`cli/`) talks to the app over HTTP, so the server must be running. Output is always JSON on stdout; errors are JSON on stderr with a non-zero exit code.

```bash
npm run dev                    # start the server (separate terminal)
npx airtable help              # list all commands
npx airtable bases list
npx airtable tables get --id 1
npx airtable cells set --row-id 1 --column-id 1 --value "hello"
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
