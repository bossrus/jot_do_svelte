import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { setFriendGroupsInputSchema } from '$lib/friends/contracts';
import { FriendGroupError, friendGroupService } from '$lib/server/friends/friend-group-service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

export async function PUT(event) {
	const user = requirePlanCapability(event, 'canManageGroups');
	const userId = z.uuid().safeParse(event.params.userId);
	const body = setFriendGroupsInputSchema.safeParse(await event.request.json().catch(() => null));
	if (!userId.success || !body.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await friendGroupService.setFriendGroups(user.id, userId.data, body.data.groupIds));
	} catch (cause) {
		if (cause instanceof FriendGroupError)
			return json({ code: cause.code }, { status: cause.code === 'FRIEND_NOT_FOUND' ? 404 : 403 });
		throw cause;
	}
}
