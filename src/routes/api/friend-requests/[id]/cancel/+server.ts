import { json } from '@sveltejs/kit';
import {
	FriendRequestError,
	friendRequestService
} from '$lib/server/friends/friend-request-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { publishServerEvent } from '$lib/server/sync/events';

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	try {
		const result = await friendRequestService.cancel(event.params.id, user.id);
		await publishServerEvent(result.recipientUserId, { type: 'friend-request.changed' });
		return json({ id: result.id, status: result.status });
	} catch (cause) {
		if (cause instanceof FriendRequestError) return json({ code: cause.code }, { status: 409 });
		throw cause;
	}
}
