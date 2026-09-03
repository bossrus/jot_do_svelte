# Client database

`database.ts` defines the versioned Dexie/IndexedDB schema for tasks, ordered content blocks, image blobs and markup, task-chat messages, read state, and worker assignments.

`todo-service.ts` and `message-service.ts` own local transactions and expose reactive `liveQuery` streams to the Svelte UI. Mutations update IndexedDB first and notify the synchronization lifecycle through `local-mutations.ts`; records use dirty flags, local versions, server revisions, pending-delete state, and explicit conflict state.

Anonymous tasks remain local. For authenticated plans with synchronization enabled, `src/lib/client/sync` reconciles this database with the SvelteKit API while preserving unsynchronized local changes.
