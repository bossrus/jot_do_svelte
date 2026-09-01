import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recurringMutationSchema } from '$lib/recurring/contracts';
import { recurringService } from '$lib/server/recurring/service';
import type { RecurringContentSnapshot } from '$lib/server/db/schema';
function user(event: Parameters<RequestHandler>[0]) {
	if (!event.locals.user) error(401);
	return event.locals.user;
}
export const GET: RequestHandler = async (event) => {
	try {
		return json(await recurringService.get(user(event).id, event.params.id));
	} catch {
		error(404);
	}
};
export const PUT: RequestHandler = async (event) => {
	const body = recurringMutationSchema.safeParse(await event.request.json());
	if (!body.success) error(400);
	try {
		return json(
			await recurringService.update(
				user(event).id,
				event.params.id,
				body.data.schedule,
				body.data.enabled,
				body.data.userIds,
				body.data.groupIds
			)
		);
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'PARTICIPANT_PLAN_REQUIRED')
			error(403, { message: 'PARTICIPANT_PLAN_REQUIRED' });
		if (cause instanceof Error && cause.message === 'PLAN_REQUIRED')
			error(403, { message: 'PLAN_REQUIRED' });
		if (cause instanceof Error && cause.message === 'ACCESS_INVALID')
			error(400, { message: 'ACCESS_INVALID' });
		error(404);
	}
};
export const PATCH: RequestHandler = async (event) => {
	const body = await event.request.json();
	try {
		if (body.content)
			await recurringService.updateContent(
				user(event).id,
				event.params.id,
				body.content as RecurringContentSnapshot
			);
		else if (typeof body.todoId === 'string')
			await recurringService.refreshContent(user(event).id, event.params.id, body.todoId);
		else error(400);
		return new Response(null, { status: 204 });
	} catch {
		error(404);
	}
};
export const DELETE: RequestHandler = async (event) => {
	try {
		await recurringService.remove(user(event).id, event.params.id);
		return new Response(null, { status: 204 });
	} catch {
		error(404);
	}
};
