# Permissions

This directory centralizes plan-based server authorization.

- `plans.ts` reads the authenticated user's plan and rejects requests that require an unavailable capability.
- `sync.ts` provides the pure synchronization permission rules used by server services and tests.

The capability matrix itself is shared with the client from `src/lib/billing/plans.ts`. Resource-level task access is separate and lives in `src/lib/server/todos/access.ts`; routes and services must enforce both plan capability and resource ownership/access where applicable.
