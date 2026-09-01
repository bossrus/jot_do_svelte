import { createServerEventStream } from '$lib/server/sync/sse';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

export function GET(event) {
	const user = requireAuthenticatedUser(event);
	const { request } = event;

	return new Response(createServerEventStream(user.id, request.signal), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
