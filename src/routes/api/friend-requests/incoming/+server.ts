import { json } from '@sveltejs/kit';
import { friendRequestService } from '$lib/server/friends/friend-request-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

export async function GET(event) {
	const user = requireAuthenticatedUser(event);
	return json(await friendRequestService.listIncoming(user.id), {
		headers: { 'cache-control': 'no-store' }
	});
}
