import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function eventFor(user: App.Locals['user']) {
	return {
		locals: { user, session: null },
		request: new Request('http://localhost/api/events')
	} as Parameters<typeof GET>[0];
}

describe('GET /api/events', () => {
	it('rejects anonymous requests with 401', () => {
		expect(() => GET(eventFor(null))).toThrow();
		try {
			GET(eventFor(null));
		} catch (cause) {
			expect(cause).toMatchObject({ status: 401 });
		}
	});

	it('opens an authenticated event stream with SSE headers', async () => {
		const response = await GET(
			eventFor({ id: 'user-a', plan: 'cloud', emailVerified: true } as App.Locals['user'])
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('connection')).toBe('keep-alive');
		await response.body?.cancel();
	});

	it('allows an unverified authenticated user to receive friend invalidations', async () => {
		const event = eventFor({
			id: 'user-a',
			plan: 'cloud',
			emailVerified: false
		} as App.Locals['user']);
		const response = await GET(event);
		expect(response.status).toBe(200);
		await response.body?.cancel();
	});
});
