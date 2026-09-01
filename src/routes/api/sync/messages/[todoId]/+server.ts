import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireSyncUser, mapSyncError } from '$lib/server/sync/http';
import { messageSyncService } from '$lib/server/sync/message-sync-service';
import { putMessageSchema } from '$lib/server/sync/message-contracts';
const id = z.uuid();
export async function GET(event) {
	const user = requireSyncUser(event);
	const todoId = id.parse(event.params.todoId);
	try {
		return json(await messageSyncService.list(user.id, todoId));
	} catch (e) {
		return mapSyncError(e);
	}
}
export async function PUT(event) {
	const user = requireSyncUser(event);
	const todoId = id.parse(event.params.todoId);
	const parsed = putMessageSchema.safeParse(await event.request.json());
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		return json(await messageSyncService.put(user.id, todoId, parsed.data), { status: 201 });
	} catch (e) {
		return mapSyncError(e);
	}
}
export async function POST(event) {
	const user = requireSyncUser(event);
	const todoId = id.parse(event.params.todoId);
	try {
		return json(await messageSyncService.markRead(user.id, todoId));
	} catch (e) {
		return mapSyncError(e);
	}
}
