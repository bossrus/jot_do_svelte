import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recurringService } from '$lib/server/recurring/service';
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401);
	return json(await recurringService.getByTodo(locals.user.id, params.todoId));
};
