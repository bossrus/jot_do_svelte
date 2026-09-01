import { json } from '@sveltejs/kit';
import { requireSyncUser } from '$lib/server/sync/http';
import { todoSyncService } from '$lib/server/sync/todo-sync-service';

export async function GET(event) {
	const user = requireSyncUser(event);
	const includeContent = event.request.headers.get('x-sync-include-content') === '1';
	return json(
		includeContent
			? await todoSyncService.listWithContent(user.id)
			: await todoSyncService.list(user.id)
	);
}
