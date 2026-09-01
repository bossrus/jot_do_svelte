import { json } from '@sveltejs/kit';
import { createFriendRequestInputSchema } from '$lib/friends/contracts';
import {
	FriendRequestError,
	friendRequestService
} from '$lib/server/friends/friend-request-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { publishServerEvent } from '$lib/server/sync/events';
import { requirePlanCapability } from '$lib/server/permissions/plans';
import { notificationService } from '$lib/server/notifications/service';
import { sendFriendRequestEmail } from '$lib/server/email';
import { env } from '$env/dynamic/private';

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	const parsed = createFriendRequestInputSchema.safeParse(
		await event.request.json().catch(() => null)
	);
	if (!parsed.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	if (parsed.data.groupIds.length) requirePlanCapability(event, 'canManageGroups');
	try {
		const result = await friendRequestService.create(
			user.id,
			parsed.data.email,
			parsed.data.groupIds
		);
		if (result.result === 'created') {
			await notificationService.create({
				userId: result.recipientUserId,
				actorUserId: user.id,
				type: 'friend.requested',
				friendRequestId: result.request.id,
				dedupeKey: `friend-requested:${result.request.id}`
			});
			await publishServerEvent(result.recipientUserId, { type: 'friend-request.changed' });
		}
		if (result.result !== 'alreadyFriend') {
			const appUrl = new URL('/app', env.APP_URL || event.url.origin).toString();
			await sendFriendRequestEmail(
				result.request.recipient.email,
				{ name: user.name, email: user.email },
				appUrl
			);
		}
		const payload =
			result.result === 'alreadyFriend'
				? { result: result.result }
				: { result: result.result, request: result.request };
		return json(payload, { status: result.result === 'created' ? 201 : 200 });
	} catch (cause) {
		if (cause instanceof FriendRequestError)
			return json({ code: cause.code }, { status: cause.code === 'USER_NOT_FOUND' ? 404 : 400 });
		throw cause;
	}
}
