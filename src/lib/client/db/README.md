# Client database

`database.ts` defines the versioned Dexie database and local todo record. `todo-service.ts` owns all todo operations and exposes live queries to the Svelte UI. No server database or API is involved in this layer.
