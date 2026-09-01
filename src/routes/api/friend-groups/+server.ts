import { json } from '@sveltejs/kit';
import { createFriendGroupInputSchema } from '$lib/friends/contracts';
import { FriendGroupError, friendGroupService } from '$lib/server/friends/friend-group-service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

export async function GET(event) {
	const user = requirePlanCapability(event, 'canManageGroups');
	return json(await friendGroupService.list(user.id));
}

export async function POST(event) {
	const user = requirePlanCapability(event, 'canManageGroups');
	const parsed = createFriendGroupInputSchema.safeParse(
		await event.request.json().catch(() => null)
	);
	if (!parsed.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await friendGroupService.create(user.id, parsed.data.name), { status: 201 });
	} catch (cause) {
		if (cause instanceof FriendGroupError) return json({ code: cause.code }, { status: 409 });
		throw cause;
	}
}
