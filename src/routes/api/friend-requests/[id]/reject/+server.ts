import { json } from '@sveltejs/kit';
import {
	FriendRequestError,
	friendRequestService
} from '$lib/server/friends/friend-request-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { publishServerEvent } from '$lib/server/sync/events';
import { notificationService } from '$lib/server/notifications/service';

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	try {
		const result = await friendRequestService.reject(event.params.id, user.id);
		await publishServerEvent(result.senderUserId, { type: 'friend-request.changed' });
		await notificationService.create({
			userId: result.senderUserId,
			actorUserId: user.id,
			type: 'friend.rejected',
			friendRequestId: result.id,
			dedupeKey: `friend-rejected:${result.id}`
		});
		return json({ id: result.id, status: result.status });
	} catch (cause) {
		if (cause instanceof FriendRequestError) return json({ code: cause.code }, { status: 409 });
		throw cause;
	}
}
