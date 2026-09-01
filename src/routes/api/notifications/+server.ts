import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { notificationService } from '$lib/server/notifications/service';

export async function GET(event) {
	const user = requireAuthenticatedUser(event);
	return json(await notificationService.list(user.id));
}

const readSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });
export async function PATCH(event) {
	const user = requireAuthenticatedUser(event);
	const parsed = readSchema.safeParse(await event.request.json().catch(() => ({})));
	if (!parsed.success) return json({ code: 'VALIDATION_ERROR' }, { status: 400 });
	return json(await notificationService.markRead(user.id, parsed.data.ids));
}
