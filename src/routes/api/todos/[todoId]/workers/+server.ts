import { json } from '@sveltejs/kit';
import { workerActionSchema } from '$lib/todos/worker-contracts';
import { workerService, WorkerError } from '$lib/server/todos/worker-service';
import { requireSyncUser } from '$lib/server/sync/http';

export async function POST(event) {
	const user = requireSyncUser(event);
	const parsed = workerActionSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		return json(await workerService.mutate(user.id, event.params.todoId, parsed.data));
	} catch (error) {
		if (error instanceof WorkerError)
			return json(
				{ code: error.code },
				{ status: error.code === 'TODO_NOT_FOUND' ? 404 : error.code === 'TODO_CLOSED' ? 409 : 403 }
			);
		throw error;
	}
}
