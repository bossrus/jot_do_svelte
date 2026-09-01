import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { deleteTodoSchema, putTodoSchema } from '$lib/server/sync/contracts';
import { mapSyncError, requireSyncUser } from '$lib/server/sync/http';
import { todoSyncService } from '$lib/server/sync/todo-sync-service';

const idSchema = z.uuid();

function parseId(value: string | undefined): string | Response {
	const result = idSchema.safeParse(value);
	return result.success
		? result.data
		: json({ code: 'VALIDATION_ERROR', issues: result.error.issues }, { status: 400 });
}

async function parseJson(request: Request): Promise<unknown | Response> {
	try {
		return await request.json();
	} catch {
		return json(
			{ code: 'VALIDATION_ERROR', issues: [{ message: 'Expected JSON body' }] },
			{ status: 400 }
		);
	}
}

export async function GET(event) {
	const user = requireSyncUser(event);
	const id = parseId(event.params.id);
	if (id instanceof Response) return id;
	try {
		return json(await todoSyncService.get(user.id, id));
	} catch (cause) {
		return mapSyncError(cause);
	}
}

export async function PUT(event) {
	const user = requireSyncUser(event);
	const id = parseId(event.params.id);
	if (id instanceof Response) return id;
	const body = await parseJson(event.request);
	if (body instanceof Response) return body;
	const parsed = putTodoSchema.safeParse(body);
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		const result = await todoSyncService.put(user.id, id, parsed.data);
		return json(result, { status: result.created ? 201 : 200 });
	} catch (cause) {
		return mapSyncError(cause);
	}
}

export async function DELETE(event) {
	const user = requireSyncUser(event);
	const id = parseId(event.params.id);
	if (id instanceof Response) return id;
	const body = await parseJson(event.request);
	if (body instanceof Response) return body;
	const parsed = deleteTodoSchema.safeParse(body);
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		return json(await todoSyncService.delete(user.id, id, parsed.data.baseRevision));
	} catch (cause) {
		return mapSyncError(cause);
	}
}
