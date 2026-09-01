import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { getCurrentSession } from '$lib/server/auth/session';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { lazyRecurringScheduler } from '$lib/server/recurring/lazy-scheduler';

export async function handle({ event, resolve }) {
	if (
		(event.url.pathname.startsWith('/app') || event.url.pathname.startsWith('/api/')) &&
		event.url.pathname !== '/api/internal/recurring/run'
	)
		lazyRecurringScheduler.maybeRun();
	const current = await getCurrentSession(event);
	event.locals.session = current?.session ?? null;
	event.locals.user = current?.user ?? null;
	const language = event.url.pathname.startsWith('/ru/')
		? 'ru'
		: event.url.pathname.startsWith('/es/')
			? 'es'
			: 'en';
	const localizedResolve = (requestEvent: typeof event) =>
		resolve(requestEvent, { transformPageChunk: ({ html }) => html.replace('%lang%', language) });
	const response = await svelteKitHandler({ event, resolve: localizedResolve, auth, building });
	if (!event.url.pathname.startsWith('/app')) return response;
	const headers = new Headers(response.headers);
	headers.set('X-Robots-Tag', 'noindex, nofollow');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
