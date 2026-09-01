// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			session: import('$lib/server/auth').AuthSession['session'] | null;
			user: import('$lib/server/auth').AuthSession['user'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
