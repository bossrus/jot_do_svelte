import type { WorkerAction } from '$lib/todos/worker-contracts';
import { pullTodoById } from './sync/sync-service';

export async function mutateTodoWorker(
	todoId: string,
	action: WorkerAction['action'],
	targetUserId?: string
) {
	const response = await fetch(`/api/todos/${encodeURIComponent(todoId)}/workers`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(targetUserId ? { action, targetUserId } : { action })
	});
	if (!response.ok)
		throw new Error((await response.json().catch(() => null))?.code ?? 'WORKER_MUTATION_FAILED');
	await pullTodoById(todoId);
}
