# Quick Todo

Quick Todo is a local-first SPA for capturing todos as quickly as possible. The current MVP stores todos entirely in IndexedDB and does not call a backend API.

## Stack

- Svelte 5 and SvelteKit with TypeScript
- PostgreSQL, Drizzle ORM, and postgres.js
- IndexedDB with Dexie for local todo persistence and reactive queries
- Zod for validation where needed
- pnpm, ESLint, and Prettier

SvelteKit provides both the frontend and the server/application layer; there is no separate backend framework. Server-only database and future business logic live under `src/lib/server`.

## Setup

Install dependencies and create the local environment file:

```sh
pnpm install
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to the local PostgreSQL connection string for the
`quick_todo` database. Local development uses `APP_URL=http://localhost:5173` and the
Windows PostgreSQL instance on port `5433`.

Production settings must not be copied into the repository. Create
`/etc/jotdo/jotdo.env` on the server from `.env.production.example`; the systemd unit reads
that file directly. Never commit either `.env.local` or the populated production file.

Start the development server:

```sh
pnpm dev
```

The public landing page is rendered normally. The main application is available at `/app`; SSR is disabled only for this route branch because it depends on browser APIs and local IndexedDB data.

Run the local business-logic tests with `pnpm test`.

## Database migrations

Generate a migration after changing `src/lib/server/db/schema.ts`:

```sh
pnpm db:generate
```

Apply pending migrations:

```sh
pnpm db:migrate
```

Inspect the database interactively when useful:

```sh
pnpm db:studio
```
