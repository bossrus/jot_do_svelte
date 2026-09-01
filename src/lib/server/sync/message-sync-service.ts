import { and, asc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	dialogReadState,
	messageBlocks,
	messageImageMarkups,
	messageImages,
	messages,
	todos,
	users
} from '$lib/server/db/schema';
import { createTodoAccessHelpers } from '$lib/server/todos/access';
import { hasPlanCapability } from '$lib/server/permissions/plans';
import type { PutMessageInput } from './message-contracts';
import { SyncError } from './errors';
import { publishServerEvent } from './events';

export function createMessageSyncService(database = defaultDb) {
	const access = createTodoAccessHelpers(database);
	async function assertChatAccess(userId: string, todoId: string) {
		if (!(await access.canViewTodo(userId, todoId))) throw new SyncError('NOT_FOUND');
		const [row] = await database
			.select({ ownerId: todos.ownerId, plan: users.plan })
			.from(todos)
			.innerJoin(users, eq(users.id, userId))
			.where(eq(todos.id, todoId))
			.limit(1);
		if (!row || (row.ownerId !== userId && !hasPlanCapability(row.plan, 'canJoinSharedTodo')))
			throw new SyncError('NOT_FOUND');
	}
	async function publish(todoId: string, revision: number) {
		const [todo] = await database
			.select({ ownerId: todos.ownerId })
			.from(todos)
			.where(eq(todos.id, todoId))
			.limit(1);
		if (!todo) return;
		for (const userId of await access.getTodoAccessUserIds(todoId)) {
			if (userId !== todo.ownerId) {
				const [recipient] = await database
					.select({ plan: users.plan })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				if (!recipient || !hasPlanCapability(recipient.plan, 'canJoinSharedTodo')) continue;
			}
			await publishServerEvent(userId, { type: 'message.changed', todoId, revision });
		}
	}
	return {
		async list(userId: string, todoId: string) {
			await assertChatAccess(userId, todoId);
			const rows = await database
				.select({ message: messages, authorName: users.displayName })
				.from(messages)
				.leftJoin(users, eq(users.id, messages.authorId))
				.where(and(eq(messages.todoId, todoId), sql`${messages.deletedAt} is null`))
				.orderBy(asc(messages.createdAt), asc(messages.id));
			const output = [];
			for (const row of rows) {
				const blocks = await database
					.select()
					.from(messageBlocks)
					.where(eq(messageBlocks.messageId, row.message.id))
					.orderBy(asc(messageBlocks.position));
				const images = await database
					.select({
						id: messageImages.id,
						storageKey: messageImages.storageKey,
						mimeType: messageImages.mimeType,
						width: messageImages.width,
						height: messageImages.height,
						sizeBytes: messageImages.sizeBytes,
						markupVersion: messageImageMarkups.version,
						markupObjects: messageImageMarkups.data
					})
					.from(messageImages)
					.leftJoin(messageImageMarkups, eq(messageImageMarkups.imageId, messageImages.id))
					.where(eq(messageImages.messageId, row.message.id));
				output.push({
					id: row.message.id,
					todoId,
					authorId: row.message.authorId,
					authorName: row.authorName ?? 'Система',
					type: row.message.type,
					eventType: row.message.eventType,
					revision: row.message.revision,
					createdAt: row.message.createdAt,
					updatedAt: row.message.updatedAt,
					blocks: blocks.map((b) =>
						b.type === 'text'
							? { id: b.id, type: b.type, position: b.position, text: b.text ?? '' }
							: { id: b.id, type: b.type, position: b.position, imageId: b.imageId! }
					),
					images: images.map((i) => ({
						...i,
						markup:
							i.markupVersion === null
								? null
								: { version: i.markupVersion, objects: i.markupObjects }
					}))
				});
			}
			const [todo] = await database
				.select({ count: todos.userMessageCount })
				.from(todos)
				.where(eq(todos.id, todoId));
			const [read] = await database
				.select()
				.from(dialogReadState)
				.where(and(eq(dialogReadState.todoId, todoId), eq(dialogReadState.userId, userId)));
			const readCount = read?.readUserMessagesCount ?? 0;
			const unreadCount = rows
				.filter((row) => row.message.type === 'user')
				.slice(readCount)
				.filter((row) => row.message.authorId !== userId).length;
			return {
				messages: output,
				userMessageCount: todo?.count ?? 0,
				readUserMessagesCount: readCount,
				unreadCount
			};
		},
		async put(userId: string, todoId: string, input: PutMessageInput) {
			await assertChatAccess(userId, todoId);
			const result = await database.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(messages)
					.where(eq(messages.id, input.id))
					.limit(1);
				if (existing) {
					if (existing.authorId !== userId || existing.todoId !== todoId)
						throw new SyncError('NOT_FOUND');
					// Messages are immutable after creation. A repeated client-generated UUID is a
					// retry after a lost response, so acknowledge the original write without
					// advancing revision or replaying side effects.
					return { revision: existing.revision, created: false, publish: false };
				}
				const now = new Date();
				for (const image of input.images)
					if (!image.storageKey.startsWith(`users/${userId}/images/${image.id}.`))
						throw new SyncError('INVALID_STORAGE_KEY');
				await tx.insert(messages).values({
					id: input.id,
					todoId,
					authorId: userId,
					type: 'user',
					revision: 1,
					createdAt: now,
					updatedAt: now
				});
				if (input.images.length)
					await tx.insert(messageImages).values(
						input.images.map((i) => ({
							id: i.id,
							messageId: input.id,
							storageKey: i.storageKey,
							mimeType: i.mimeType,
							width: i.width,
							height: i.height,
							sizeBytes: i.sizeBytes,
							sortOrder:
								input.blocks.find((b) => b.type === 'image' && b.imageId === i.id)?.position ?? 0,
							createdAt: now,
							updatedAt: now
						}))
					);
				if (input.blocks.length)
					await tx.insert(messageBlocks).values(
						input.blocks.map((b) => ({
							id: b.id,
							messageId: input.id,
							type: b.type,
							position: b.position,
							text: b.type === 'text' ? b.text : null,
							imageId: b.type === 'image' ? b.imageId : null
						}))
					);
				const markups = input.images.flatMap((i) =>
					i.markup ? [{ imageId: i.id, data: i.markup.objects, version: 1, updatedAt: now }] : []
				);
				if (markups.length) await tx.insert(messageImageMarkups).values(markups);
				await tx
					.update(todos)
					.set({ userMessageCount: sql`${todos.userMessageCount}+1` })
					.where(eq(todos.id, todoId));
				return { revision: 1, created: true, publish: true };
			});
			if (result.publish) await publish(todoId, result.revision);
			return { revision: result.revision, created: result.created };
		},
		async markRead(userId: string, todoId: string) {
			await assertChatAccess(userId, todoId);
			const [todo] = await database
				.select({ count: todos.userMessageCount })
				.from(todos)
				.where(eq(todos.id, todoId));
			const count = todo?.count ?? 0;
			await database
				.insert(dialogReadState)
				.values({ todoId, userId, readUserMessagesCount: count, updatedAt: new Date() })
				.onConflictDoUpdate({
					target: [dialogReadState.todoId, dialogReadState.userId],
					set: { readUserMessagesCount: count, updatedAt: new Date() }
				});
			return { readUserMessagesCount: count };
		}
	};
}
export const messageSyncService = createMessageSyncService();
