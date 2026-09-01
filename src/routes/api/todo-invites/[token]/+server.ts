import { json } from '@sveltejs/kit';
import { todoInviteService } from '$lib/server/todos/invite-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

export async function GET(event) {
	return json(await todoInviteService.preview(event.params.token, event.locals.user?.id ?? null), {
		headers: { 'cache-control': 'private, no-store' }
	});
}

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	try {
		return json(await todoInviteService.request(event.params.token, user.id));
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'code' in cause)
			return json({ code: cause.code }, { status: cause.code === 'INVITE_NOT_FOUND' ? 404 : 400 });
		throw cause;
	}
}
