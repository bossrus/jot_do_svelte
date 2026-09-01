import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recurringCreateSchema } from '$lib/recurring/contracts';
import { recurringService } from '$lib/server/recurring/service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

export const GET: RequestHandler = async (event) => {
	if (!event.locals.user) error(401);
	return json(await recurringService.list(event.locals.user.id));
};

export const POST: RequestHandler = async (event) => {
	const user = requirePlanCapability(event, 'canUseRecurringTodos');
	const parsed = recurringCreateSchema.safeParse(await event.request.json());
	if (!parsed.success) error(400, { message: 'INVALID_RECURRING' });
	try {
		return json(
			await recurringService.createFromTodo(
				user.id,
				parsed.data.todoId,
				parsed.data.schedule,
				parsed.data.enabled,
				parsed.data.userIds,
				parsed.data.groupIds
			),
			{ status: 201 }
		);
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'NOT_FOUND') error(404);
		if (cause instanceof Error && cause.message === 'PARTICIPANT_PLAN_REQUIRED')
			error(403, { message: 'PARTICIPANT_PLAN_REQUIRED' });
		if (cause instanceof Error && cause.message === 'PLAN_REQUIRED')
			error(403, { message: 'PLAN_REQUIRED' });
		if (cause instanceof Error && cause.message === 'ACCESS_INVALID')
			error(400, { message: 'ACCESS_INVALID' });
		throw cause;
	}
};
