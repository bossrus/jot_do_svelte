import { json } from '@sveltejs/kit';
import { friendService } from '$lib/server/friends/friend-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

export async function GET(event) {
	const user = requireAuthenticatedUser(event);
	return json(await friendService.list(user.id));
}
