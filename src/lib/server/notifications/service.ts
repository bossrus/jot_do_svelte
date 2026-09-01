import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import { notifications, users, type NotificationPayload } from '$lib/server/db/schema';
import { publishServerEvent } from '$lib/server/sync/events';

type Database = typeof defaultDb;
type Writer = Pick<Database, 'insert'>;
export type NotificationType =
	| 'friend.requested'
	| 'friend.accepted'
	| 'friend.rejected'
	| 'todo.access-granted'
	| 'todo.access-revoked'
	| 'group.added'
	| 'group.removed'
	| 'worker.assigned'
	| 'worker.removed'
	| 'worker.started'
	| 'worker.completed'
	| 'worker.left'
	| 'support.received';

export type CreateNotification = {
	userId: string;
	type: NotificationType;
	actorUserId?: string | null;
	todoId?: string | null;
	groupId?: string | null;
	friendRequestId?: string | null;
	payload?: NotificationPayload;
	dedupeKey?: string | null;
};

export async function insertNotification(writer: Writer, input: CreateNotification) {
	if (input.actorUserId === input.userId) return null;
	const [row] = await writer
		.insert(notifications)
		.values({ ...input, payload: input.payload ?? {} })
		.onConflictDoNothing()
		.returning({ id: notifications.id });
	return row?.id ?? null;
}

export function createNotificationService(database: Database = defaultDb) {
	return {
		async create(input: CreateNotification) {
			const id = await insertNotification(database, input);
			if (id) await publishServerEvent(input.userId, { type: 'notifications.changed' });
			return id;
		},
		async list(userId: string, limit = 50) {
			const rows = await database
				.select({
					id: notifications.id,
					type: notifications.type,
					actorUserId: notifications.actorUserId,
					actorName: users.displayName,
					todoId: notifications.todoId,
					groupId: notifications.groupId,
					friendRequestId: notifications.friendRequestId,
					payload: notifications.payload,
					createdAt: notifications.createdAt,
					readAt: notifications.readAt
				})
				.from(notifications)
				.leftJoin(users, eq(users.id, notifications.actorUserId))
				.where(eq(notifications.userId, userId))
				.orderBy(desc(notifications.createdAt))
				.limit(Math.min(limit, 100));
			const [{ value }] = await database
				.select({ value: count() })
				.from(notifications)
				.where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
			return { notifications: rows, unreadCount: Number(value) };
		},
		async markRead(userId: string, ids?: string[]) {
			const condition = ids?.length
				? and(
						eq(notifications.userId, userId),
						inArray(notifications.id, ids),
						isNull(notifications.readAt)
					)
				: and(eq(notifications.userId, userId), isNull(notifications.readAt));
			const changed = await database
				.update(notifications)
				.set({ readAt: new Date() })
				.where(condition)
				.returning({ id: notifications.id });
			if (changed.length) await publishServerEvent(userId, { type: 'notifications.changed' });
			return { updated: changed.length };
		}
	};
}
export const notificationService = createNotificationService();
