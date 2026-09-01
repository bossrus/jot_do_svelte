import { json } from '@sveltejs/kit';
import { requireSyncUser } from '$lib/server/sync/http';
import { todoInviteService } from '$lib/server/todos/invite-service';

export async function GET(event) {
	const owner = requireSyncUser(event);
	return json(await todoInviteService.listPending(owner.id), {
		headers: { 'cache-control': 'private, no-store' }
	});
}
