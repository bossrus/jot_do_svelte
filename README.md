# JotDo

JotDo is a local-first task application built around fast capture, offline work, and optional collaboration. The browser is the primary data store: tasks remain usable without an account or network connection, while authenticated users with an eligible plan can synchronize them with the server and share them with other people.

The repository contains the complete web application and API. SvelteKit serves the public pages, browser-only task UI, JSON endpoints, authentication hooks, and server-side business logic; there is no separate backend service.

## Product capabilities

- Create, edit, close, reopen, search, filter, and delete tasks locally.
- Compose task and chat content from ordered text and image blocks.
- Annotate images with freehand paths and text, including color, thickness, zoom, undo, and redo controls.
- Register and sign in with email/password, verify email addresses, reset passwords, and change account email.
- Synchronize tasks, images, task chats, read state, and worker state between IndexedDB and PostgreSQL.
- Share tasks with individual contacts or contact groups, define default recipients, and invite people through revocable links and access requests.
- Maintain contacts, friend requests, former contacts, and custom contact groups.
- Assign participants as workers and track `doing` / `done` state.
- Create recurring task templates for daily, weekday, day-interval, week-interval, and monthly schedules in the user's time zone.
- Receive in-app notifications and near-real-time collaboration updates.
- Purchase feature plans for yourself or sponsor another user through Paddle Billing.
- Send support requests containing text and images; administrators can inspect users, plans, avatars, and support requests.
- Switch between light and dark themes and use the interface in English, Russian, or Spanish.
- Serve localized about pages plus `robots.txt` and `sitemap.xml` for public-page SEO.

## Architecture and tactics

### Local-first client

The `/app` route is a browser-only SPA (`ssr = false`) because it depends on IndexedDB, blobs, and other browser APIs. Dexie provides a versioned local database and reactive queries for tasks, ordered content blocks, images, image markup, chat messages, read counters, and worker assignments. Local mutations are committed immediately and marked dirty, so the UI does not wait for a server round trip.

Synchronization is an optional capability rather than a prerequisite for using the app. A debounced auto-push queue sends dirty records when a valid session and network are available. Server records carry monotonically increasing revisions; writes include `baseRevision`, and optimistic-concurrency conflicts preserve local data and are surfaced explicitly instead of silently overwriting it. Pull logic also accounts for soft deletes, revoked access, session changes, abort signals, and local edits made while a request is in flight.

Server-Sent Events notify connected clients about task, message, contact, access, worker, and notification changes. The client then pulls the authoritative data. The current event bus is process-local, which suits the provided single Node.js service deployment.

### Server and persistence

SvelteKit route handlers are thin HTTP adapters over service modules in `src/lib/server`. Request bodies and event payloads are validated with Zod. PostgreSQL is accessed through Drizzle ORM and `postgres.js`; the schema uses foreign keys, checks, partial unique indexes, transactions, soft deletion, and idempotency records where appropriate. Drizzle Kit owns the committed SQL migrations in `drizzle/`.

Better Auth handles cookie sessions and email/password authentication using the Drizzle adapter. Verification and password-reset messages are sent through Nodemailer/SMTP. Server-side capability checks map the `free`, `cloud`, `join`, `share`, and `group` plans to synchronization, joining, sharing, group-management, and recurring-task permissions.

Task and message images use an S3-compatible object store through the AWS SDK. Metadata remains in PostgreSQL, browser blobs remain in IndexedDB, and transfers use prepared/confirmed upload flows plus presigned URLs. Supported application images are JPEG, PNG, and WebP, with a configurable size limit.

Paddle.js opens checkout in the browser, while the Paddle Node SDK creates and previews transactions on the server. Signed webhooks update subscriptions idempotently. Billing supports monthly, annual, and five-year periods as well as sponsored subscriptions.

Recurring tasks are materialized from immutable content/access snapshots. The scheduler records each occurrence under a unique `(template, scheduled time)` key to prevent duplicates. It can run lazily inside the application process and can also be invoked through a secret-protected internal endpoint by an external scheduler.

### UI, localization, and quality

The UI uses Svelte 5 runes throughout, reusable Svelte components, a small set of layout primitives, native CSS, and Tabler rune-compatible icons. Inlang Paraglide compiles type-safe messages from `messages/en.json`, `messages/ru.json`, and `messages/es.json`. Vitest covers client services, synchronization and conflict cases, contracts, authorization rules, scheduling, storage, billing webhooks, and server utilities; `fake-indexeddb` supports browser-database tests in Node.js.

Production builds use `@sveltejs/adapter-node`. The repository includes a hardened systemd service, an Nginx TLS reverse-proxy configuration, an SSH-hardening drop-in, and a smoke-test script for object storage.

## Technology stack

- Svelte 5 (runes), SvelteKit 2, TypeScript, Vite
- SvelteKit Node adapter and Node.js production runtime
- Dexie and IndexedDB for local persistence
- PostgreSQL, Drizzle ORM, Drizzle Kit, and `postgres.js`
- Better Auth with the Drizzle adapter
- Zod for runtime contracts and request validation
- Inlang Paraglide JS for English, Russian, and Spanish localization
- AWS SDK S3 client and presigner for S3-compatible/R2 object storage
- Paddle.js and the Paddle Node SDK for billing
- Nodemailer and SMTP for transactional email and support delivery
- Server-Sent Events for live invalidation signals
- Tabler Icons for Svelte runes
- Vitest and `fake-indexeddb` for tests
- ESLint, Prettier, `svelte-check`, and strict TypeScript for static quality checks
- pnpm for package and script management
- Nginx, systemd, and Let's Encrypt-compatible TLS paths for deployment

## Repository layout

```text
src/routes/                  Pages and SvelteKit API route handlers
src/lib/components/          Application UI and reusable layout primitives
src/lib/client/              IndexedDB, local services, sync, auth, and markup logic
src/lib/server/              Auth, database, sync, permissions, storage, billing, and services
src/lib/billing/             Shared plan and pricing definitions
src/lib/friends|todos|recurring/
                             Shared Zod contracts and domain types
messages/                    Paraglide source messages (en, ru, es)
project.inlang/              Localization project configuration
drizzle/                     Generated and committed PostgreSQL migrations
deploy/                      systemd, Nginx, and SSH production configuration
scripts/                     Operational smoke tests
```

## Local setup

Prerequisites: a current Node.js release, pnpm, and PostgreSQL. S3-compatible storage, SMTP, and Paddle credentials are only required for the corresponding features.

```sh
pnpm install
cp .env.example .env.local
```

On PowerShell, use:

```powershell
Copy-Item .env.example .env.local
```

At minimum, configure `DATABASE_URL` and a random `BETTER_AUTH_SECRET` of at least 32 characters in `.env.local`. `APP_URL` defaults to `http://localhost:5173`; the example database URL uses PostgreSQL on port `5433` and database `quick_todo`.

Start the development server:

```sh
pnpm dev
```

The landing page is at `/`; the main local-first application is at `/app`.

### Environment variables

| Area       | Variables                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core       | `DATABASE_URL`, `APP_URL`, `BETTER_AUTH_SECRET`                                                                                                       |
| Email      | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`                                                                    |
| Images     | `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MAX_IMAGE_SIZE_BYTES`                                                        |
| Paddle     | `PADDLE_ENVIRONMENT`, `PADDLE_API_KEY`, `PADDLE_SANDBOX_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PUBLIC_PADDLE_CLIENT_TOKEN`, and the `PADDLE_PRICE_*` IDs |
| Operations | `RECURRING_SCHEDULER_SECRET`, `ADMIN_EMAILS`, `ENABLE_FAKE_PAYMENTS`                                                                                  |

Use sandbox Paddle credentials locally. `ENABLE_FAKE_PAYMENTS=true` enables the development-only payment-success endpoint and must not be enabled in production. Do not commit populated environment files: `.env`, `.env.local`, and other `.env.*` files are ignored except for the checked-in examples.

## Database migrations

After changing `src/lib/server/db/schema.ts`, generate and review a migration:

```sh
pnpm db:generate
```

Apply pending migrations:

```sh
pnpm db:migrate
```

Open Drizzle Studio when interactive inspection is useful:

```sh
pnpm db:studio
```

## Checks and useful commands

```sh
pnpm test            # run the Vitest suite once
pnpm check           # run Svelte and TypeScript diagnostics
pnpm lint            # verify Prettier formatting and ESLint rules
pnpm format          # format the repository
pnpm build           # create the adapter-node production build
pnpm preview         # preview a production build locally
pnpm storage:smoke   # exercise upload, metadata, presigned URLs, and cleanup
```

`pnpm storage:smoke` performs real writes and deletes against the configured object-storage bucket.

## Production deployment

Create `/etc/jotdo/jotdo.env` from `.env.production.example`, fill in all secrets and provider credentials on the server, apply migrations, and build with `pnpm build`. The provided `deploy/jotdo.service` runs `node build` as the dedicated `jotdo` user on `127.0.0.1:3000`; `deploy/jotdo.nginx` proxies HTTPS traffic for `jotdo.site` and supports long-lived SSE connections.

The example production environment is intentionally minimal. Add the SMTP, object-storage, Paddle webhook/price, scheduler, and administrator variables required by the enabled features. Keep the production environment file outside the repository.
