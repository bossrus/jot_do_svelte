import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireSyncUser } from '$lib/server/sync/http';
import { TodoAccessError, todoAccessService } from '$lib/server/todos/access-service';
import { setTodoAccessInputSchema } from '$lib/todos/access-contracts';
import { requirePlanCapability } from '$lib/server/permissions/plans';

export async function GET(event) {
	const owner = requireSyncUser(event);
	const todoId = z.uuid().safeParse(event.params.todoId);
	if (!todoId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await todoAccessService.list(owner.id, todoId.data));
	} catch (cause) {
		if (cause instanceof TodoAccessError)
			return json({ code: cause.code }, { status: cause.code === 'TODO_NOT_FOUND' ? 404 : 400 });
		throw cause;
	}
}

export async function PUT(event) {
	const owner = requirePlanCapability(event, 'canShareTodo');
	const todoId = z.uuid().safeParse(event.params.todoId);
	if (!todoId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	}
	const parsed = setTodoAccessInputSchema.safeParse(body);
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		return json(
			await todoAccessService.set(owner.id, todoId.data, parsed.data.userIds, parsed.data.groupIds)
		);
	} catch (cause) {
		if (!(cause instanceof TodoAccessError)) throw cause;
		const status = cause.code === 'TODO_NOT_FOUND' ? 404 : 400;
		return json({ code: cause.code }, { status });
	}
}
