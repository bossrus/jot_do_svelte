import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireSyncUser } from '$lib/server/sync/http';
import { TodoInviteError, todoInviteService } from '$lib/server/todos/invite-service';

export async function POST(event) {
	const owner = requireSyncUser(event);
	const id = z.uuid().safeParse(event.params.id);
	if (!id.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	try {
		return json(await todoInviteService.reject(id.data, owner.id));
	} catch (cause) {
		if (cause instanceof TodoInviteError) return json({ code: cause.code }, { status: 404 });
		throw cause;
	}
}
