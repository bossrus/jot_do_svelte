import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireSyncUser } from '$lib/server/sync/http';
import { TodoInviteError, todoInviteService } from '$lib/server/todos/invite-service';
import { requirePlanCapability } from '$lib/server/permissions/plans';

function failure(cause: unknown) {
	if (!(cause instanceof TodoInviteError)) throw cause;
	return json({ code: cause.code }, { status: cause.code === 'TODO_NOT_FOUND' ? 404 : 400 });
}

export async function GET(event) {
	const owner = requireSyncUser(event);
	const todoId = z.uuid().safeParse(event.params.todoId);
	if (!todoId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await todoInviteService.linkStatus(owner.id, todoId.data));
	} catch (cause) {
		return failure(cause);
	}
}

export async function POST(event) {
	const owner = requirePlanCapability(event, 'canShareTodo');
	const todoId = z.uuid().safeParse(event.params.todoId);
	if (!todoId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		const result = await todoInviteService.rotateLink(owner.id, todoId.data);
		return json({ active: true, url: `${event.url.origin}/invite/todo/${result.token}` });
	} catch (cause) {
		return failure(cause);
	}
}

export async function DELETE(event) {
	const owner = requireSyncUser(event);
	const todoId = z.uuid().safeParse(event.params.todoId);
	if (!todoId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await todoInviteService.disableLink(owner.id, todoId.data));
	} catch (cause) {
		return failure(cause);
	}
}
