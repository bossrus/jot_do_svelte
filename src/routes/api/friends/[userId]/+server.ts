import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { removeFriendInputSchema } from '$lib/friends/contracts';
import { friendService } from '$lib/server/friends/friend-service';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

export async function DELETE(event) {
	const user = requireAuthenticatedUser(event);
	const userId = z.uuid().safeParse(event.params.userId);
	if (!userId.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });

	let body: unknown = {};
	const text = await event.request.text();
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
		}
	}
	const parsed = removeFriendInputSchema.safeParse(body);
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	return json(await friendService.remove(user.id, userId.data, parsed.data.reason));
}
