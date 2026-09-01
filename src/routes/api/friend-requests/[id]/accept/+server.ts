import { json } from '@sveltejs/kit';
import { acceptFriendRequestInputSchema } from '$lib/friends/contracts';
import {
	FriendRequestError,
	friendRequestService
} from '$lib/server/friends/friend-request-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { publishServerEvent } from '$lib/server/sync/events';
import { requirePlanCapability } from '$lib/server/permissions/plans';
import { notificationService } from '$lib/server/notifications/service';

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	const parsed = acceptFriendRequestInputSchema.safeParse(
		await event.request.json().catch(() => null)
	);
	if (!parsed.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	if (parsed.data.groupIds.length) requirePlanCapability(event, 'canManageGroups');
	try {
		const result = await friendRequestService.accept(
			event.params.id,
			user.id,
			parsed.data.addSenderToMyFriends,
			parsed.data.groupIds
		);
		await publishServerEvent(result.senderUserId, { type: 'friend-request.changed' });
		await notificationService.create({
			userId: result.senderUserId,
			actorUserId: user.id,
			type: 'friend.accepted',
			friendRequestId: result.id,
			dedupeKey: `friend-accepted:${result.id}`
		});
		if (parsed.data.addSenderToMyFriends)
			await publishServerEvent(user.id, { type: 'friend-request.changed' });
		return json({ id: result.id, status: result.status });
	} catch (cause) {
		if (cause instanceof FriendRequestError)
			return json(
				{ code: cause.code },
				{
					status: cause.code === 'FORBIDDEN' ? 403 : cause.code === 'REQUEST_NOT_FOUND' ? 404 : 409
				}
			);
		throw cause;
	}
}
