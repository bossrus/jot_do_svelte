# Authentication

`index.ts` configures Better Auth with email/password credentials, cookie integration for SvelteKit, email verification, password reset, email changes, and the Drizzle PostgreSQL adapter. New users receive a generated public ID and the `free` plan.

`session.ts` contains the shared request-session helpers used by route handlers. `public-id.ts` owns public identifier generation. Transactional email rendering and SMTP delivery live in `src/lib/server/email`.

`BETTER_AUTH_SECRET` must contain at least 32 characters outside the build phase, and `APP_URL` defines the public origin used in verification and reset links.
