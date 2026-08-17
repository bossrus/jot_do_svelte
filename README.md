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
cp .env.example .env
```

Set `DATABASE_URL` in `.env` to a PostgreSQL connection string for the `quick_todo` database. Never commit `.env`.

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
