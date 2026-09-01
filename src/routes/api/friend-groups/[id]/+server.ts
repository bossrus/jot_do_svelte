import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { updateFriendGroupInputSchema } from '$lib/friends/contracts';
import { FriendGroupError, friendGroupService } from '$lib/server/friends/friend-group-service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

function status(code: string) {
	return code === 'GROUP_NOT_FOUND' ? 404 : 409;
}

export async function PATCH(event) {
	const user = requirePlanCapability(event, 'canManageGroups');
	const id = z.uuid().safeParse(event.params.id);
	const body = updateFriendGroupInputSchema.safeParse(await event.request.json().catch(() => null));
	if (!id.success || !body.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await friendGroupService.rename(user.id, id.data, body.data.name));
	} catch (cause) {
		if (cause instanceof FriendGroupError)
			return json({ code: cause.code }, { status: status(cause.code) });
		throw cause;
	}
}

export async function DELETE(event) {
	const user = requirePlanCapability(event, 'canManageGroups');
	const id = z.uuid().safeParse(event.params.id);
	if (!id.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await friendGroupService.remove(user.id, id.data));
	} catch (cause) {
		if (cause instanceof FriendGroupError)
			return json({ code: cause.code }, { status: status(cause.code) });
		throw cause;
	}
}
