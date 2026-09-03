import { json } from '@sveltejs/kit';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/admin/auth';
import { db } from '$lib/server/db';
import { supportRequests, users } from '$lib/server/db/schema';

export async function GET(event) {
	requireAdmin(event);
	if (!z.uuid().safeParse(event.params.id).success)
		return json({ message: 'Пользователь не найден' }, { status: 404 });
	const user = (
		await db
			.select({ id: users.id, displayName: users.displayName, email: users.email })
			.from(users)
			.where(eq(users.id, event.params.id))
			.limit(1)
	)[0];
	if (!user) return json({ message: 'Пользователь не найден' }, { status: 404 });
	const requests = await db
		.select({
			id: supportRequests.id,
			content: supportRequests.content,
			createdAt: supportRequests.createdAt,
			readAt: supportRequests.readAt
		})
		.from(supportRequests)
		.where(eq(supportRequests.userId, user.id))
		.orderBy(desc(supportRequests.createdAt));
	const unreadIds = requests
		.filter((request) => request.readAt === null)
		.map((request) => request.id);
	if (unreadIds.length)
		await db
			.update(supportRequests)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(supportRequests.userId, user.id),
					inArray(supportRequests.id, unreadIds),
					isNull(supportRequests.readAt)
				)
			);
	return json({
		user,
		requests: requests.map((request) => ({
			...request,
			content: {
				...request.content,
				images: request.content.images.map((image) => ({
					...image,
					url: `/api/admin/support/${encodeURIComponent(request.id)}/images/${encodeURIComponent(image.id)}`
				}))
			}
		}))
	});
}
