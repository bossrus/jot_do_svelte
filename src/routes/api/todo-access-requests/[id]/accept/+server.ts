import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { resolveTodoAccessRequestInputSchema } from '$lib/todos/invite-contracts';
import { TodoInviteError, todoInviteService } from '$lib/server/todos/invite-service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

export async function POST(event) {
	const owner = requirePlanCapability(event, 'canShareTodo');
	const id = z.uuid().safeParse(event.params.id);
	const body = await event.request.json().catch(() => null);
	const input = resolveTodoAccessRequestInputSchema.safeParse(body);
	if (!id.success || !input.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	if (input.data.groupIds.length) requirePlanCapability(event, 'canManageGroups');
	try {
		return json(
			await todoInviteService.accept(id.data, owner.id, input.data.addFriend, input.data.groupIds)
		);
	} catch (cause) {
		if (cause instanceof TodoInviteError)
			return json(
				{ code: cause.code },
				{ status: cause.code === 'REQUEST_NOT_PENDING' ? 404 : 400 }
			);
		throw cause;
	}
}
