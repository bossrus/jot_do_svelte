import { asc, eq, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	todoAccessRevocations,
	contactGroupMembers,
	todoBlocks,
	todoImageMarkups,
	todoImages,
	todoGroupAccess,
	todoUserAccess,
	todoWorkers,
	todos,
	users
} from '$lib/server/db/schema';
import { createTodoAccessHelpers } from '$lib/server/todos/access';
import type { PutTodoInput } from './contracts';
import { SyncError } from './errors';
import { publishServerEvent, type PublishServerEvent } from './events';
import { hasPlanCapability } from '$lib/server/permissions/plans';
import { addSystemMessage } from './system-messages';

type Database = typeof defaultDb;

export function createTodoSyncService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent
) {
	const access = createTodoAccessHelpers(database);

	async function publishToTodoUsers(todoId: string, event: Parameters<PublishServerEvent>[1]) {
		const [todo] = await database
			.select({ ownerId: todos.ownerId })
			.from(todos)
			.where(eq(todos.id, todoId))
			.limit(1);
		if (!todo) return;
		for (const recipientId of await access.getTodoAccessUserIds(todoId)) {
			if (recipientId !== todo.ownerId) {
				const [recipient] = await database
					.select({ plan: users.plan })
					.from(users)
					.where(eq(users.id, recipientId))
					.limit(1);
				if (!recipient || !hasPlanCapability(recipient.plan, 'canJoinSharedTodo')) continue;
			}
			await publish(recipientId, event);
		}
	}
	function validateStorageKeys(userId: string, input: PutTodoInput) {
		for (const image of input.images) {
			const extension =
				image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/png' ? 'png' : 'webp';
			const expected = `users/${userId}/images/${image.id}.${extension}`;
			if (image.storageKey !== expected) throw new SyncError('INVALID_STORAGE_KEY');
		}
	}

	async function replaceContent(
		tx: Parameters<Parameters<Database['transaction']>[0]>[0],
		todoId: string,
		input: PutTodoInput,
		now: Date
	) {
		await tx.delete(todoBlocks).where(eq(todoBlocks.todoId, todoId));
		await tx.delete(todoImages).where(eq(todoImages.todoId, todoId));
		if (input.images.length)
			await tx.insert(todoImages).values(
				input.images.map((image) => ({
					id: image.id,
					todoId,
					storageKey: image.storageKey,
					mimeType: image.mimeType,
					width: image.width,
					height: image.height,
					sizeBytes: image.sizeBytes,
					sortOrder:
						input.blocks.find((block) => block.type === 'image' && block.imageId === image.id)
							?.position ?? 0,
					createdAt: now,
					updatedAt: now
				}))
			);
		if (input.blocks.length)
			await tx.insert(todoBlocks).values(
				input.blocks.map((block) => ({
					id: block.id,
					todoId,
					type: block.type,
					position: block.position,
					text: block.type === 'text' ? block.text : null,
					imageId: block.type === 'image' ? block.imageId : null
				}))
			);
		const markups = input.images.flatMap((image) =>
			image.markup
				? [
						{
							imageId: image.id,
							data: image.markup.objects,
							version: image.markup.version,
							updatedAt: now
						}
					]
				: []
		);
		if (markups.length) await tx.insert(todoImageMarkups).values(markups);
	}

	async function contentMatches(
		tx: Parameters<Parameters<Database['transaction']>[0]>[0],
		todoId: string,
		status: 'active' | 'closed',
		existingStatus: 'active' | 'closed',
		input: PutTodoInput
	) {
		if (status !== existingStatus) return false;
		const blocks = await tx
			.select({
				id: todoBlocks.id,
				type: todoBlocks.type,
				position: todoBlocks.position,
				text: todoBlocks.text,
				imageId: todoBlocks.imageId
			})
			.from(todoBlocks)
			.where(eq(todoBlocks.todoId, todoId))
			.orderBy(asc(todoBlocks.position));
		const images = await tx
			.select({
				id: todoImages.id,
				storageKey: todoImages.storageKey,
				mimeType: todoImages.mimeType,
				width: todoImages.width,
				height: todoImages.height,
				sizeBytes: todoImages.sizeBytes,
				markupVersion: todoImageMarkups.version,
				markupObjects: todoImageMarkups.data
			})
			.from(todoImages)
			.leftJoin(todoImageMarkups, eq(todoImages.id, todoImageMarkups.imageId))
			.where(eq(todoImages.todoId, todoId));
		const normalizedBlocks = blocks.map((block) =>
			block.type === 'text'
				? { id: block.id, type: block.type, position: block.position, text: block.text ?? '' }
				: { id: block.id, type: block.type, position: block.position, imageId: block.imageId! }
		);
		const normalizedImages = images
			.map((image) => ({
				id: image.id,
				storageKey: image.storageKey,
				mimeType: image.mimeType,
				width: image.width,
				height: image.height,
				sizeBytes: image.sizeBytes,
				markup:
					image.markupVersion === null
						? null
						: { version: image.markupVersion, objects: image.markupObjects }
			}))
			.sort((a, b) => a.id.localeCompare(b.id));
		const inputImages = [...input.images].sort((a, b) => a.id.localeCompare(b.id));
		return (
			JSON.stringify(normalizedBlocks) === JSON.stringify(input.blocks) &&
			JSON.stringify(normalizedImages) === JSON.stringify(inputImages)
		);
	}

	return {
		async list(userId: string) {
			const [viewer] = await database
				.select({ plan: users.plan })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			const canReceiveShared = Boolean(
				viewer && hasPlanCapability(viewer.plan, 'canJoinSharedTodo')
			);
			return database.transaction(
				async (tx) => {
					const items = await tx
						.select({
							id: todos.id,
							ownerId: todos.ownerId,
							ownerName: sql<
								string | null
							>`(select ${users.displayName} from ${users} where ${users.id} = ${todos.ownerId})`,
							revision: todos.revision,
							status: todos.status,
							createdAt: todos.createdAt,
							updatedAt: todos.updatedAt,
							deletedAt: todos.deletedAt,
							isAutomatic: todos.isAutomatic,
							recurringTemplateId: todos.recurringTemplateId
						})
						.from(todos)
						.where(
							canReceiveShared
								? or(
										eq(todos.ownerId, userId),
										sql`exists (select 1 from ${todoUserAccess} where ${todoUserAccess.todoId} = ${todos.id} and ${todoUserAccess.userId} = ${userId})`,
										sql`exists (select 1 from ${todoGroupAccess} join ${contactGroupMembers} on ${contactGroupMembers.groupId} = ${todoGroupAccess.groupId} where ${todoGroupAccess.todoId} = ${todos.id} and ${contactGroupMembers.userId} = ${userId})`
									)
								: eq(todos.ownerId, userId)
						)
						.orderBy(asc(todos.updatedAt));
					const revocations = await tx
						.select({ todoId: todoAccessRevocations.todoId })
						.from(todoAccessRevocations)
						.where(eq(todoAccessRevocations.userId, userId));
					const accessibleIds = new Set(items.map((item) => item.id));
					return {
						todos: items,
						revokedTodoIds: revocations
							.map((row) => row.todoId)
							.filter((todoId) => !accessibleIds.has(todoId))
					};
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			);
		},

		async listWithContent(userId: string) {
			const index = await this.list(userId);
			const fullTodos = await Promise.all(index.todos.map((todo) => this.get(userId, todo.id)));
			return { ...index, fullTodos };
		},

		async get(userId: string, id: string) {
			if (!(await access.canViewTodo(userId, id))) throw new SyncError('NOT_FOUND');
			const [todo] = await database.select().from(todos).where(eq(todos.id, id)).limit(1);
			if (!todo) throw new SyncError('NOT_FOUND');
			const [owner] = await database
				.select({ name: users.displayName })
				.from(users)
				.where(eq(users.id, todo.ownerId))
				.limit(1);
			if (todo.ownerId !== userId) {
				const [viewer] = await database
					.select({ plan: users.plan })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				if (!viewer || !hasPlanCapability(viewer.plan, 'canJoinSharedTodo'))
					throw new SyncError('NOT_FOUND');
			}
			const blocks = await database
				.select({
					id: todoBlocks.id,
					type: todoBlocks.type,
					position: todoBlocks.position,
					text: todoBlocks.text,
					imageId: todoBlocks.imageId
				})
				.from(todoBlocks)
				.where(eq(todoBlocks.todoId, id))
				.orderBy(asc(todoBlocks.position));
			const images = await database
				.select({
					id: todoImages.id,
					storageKey: todoImages.storageKey,
					mimeType: todoImages.mimeType,
					width: todoImages.width,
					height: todoImages.height,
					sizeBytes: todoImages.sizeBytes,
					markupVersion: todoImageMarkups.version,
					markupObjects: todoImageMarkups.data
				})
				.from(todoImages)
				.leftJoin(todoImageMarkups, eq(todoImages.id, todoImageMarkups.imageId))
				.where(eq(todoImages.todoId, id));
			const workers = await database
				.select({
					userId: todoWorkers.userId,
					name: users.displayName,
					state: todoWorkers.state,
					startedAt: todoWorkers.startedAt,
					finishedAt: todoWorkers.finishedAt
				})
				.from(todoWorkers)
				.innerJoin(users, eq(users.id, todoWorkers.userId))
				.where(eq(todoWorkers.todoId, id));
			return {
				id: todo.id,
				ownerId: todo.ownerId,
				ownerName: owner?.name ?? null,
				status: todo.status,
				revision: todo.revision,
				createdAt: todo.createdAt,
				updatedAt: todo.updatedAt,
				closedAt: todo.closedAt,
				reopenedAt: todo.reopenedAt,
				deletedAt: todo.deletedAt,
				isAutomatic: todo.isAutomatic,
				recurringTemplateId: todo.recurringTemplateId,
				workers,
				blocks: blocks.map((block) =>
					block.type === 'text'
						? { id: block.id, type: block.type, position: block.position, text: block.text ?? '' }
						: { id: block.id, type: block.type, position: block.position, imageId: block.imageId! }
				),
				images: images.map((image) => ({
					id: image.id,
					storageKey: image.storageKey,
					mimeType: image.mimeType,
					width: image.width,
					height: image.height,
					sizeBytes: image.sizeBytes,
					markup:
						image.markupVersion === null
							? null
							: { version: image.markupVersion, objects: image.markupObjects }
				}))
			};
		},

		async put(userId: string, id: string, input: PutTodoInput) {
			if (id !== input.id) throw new SyncError('NOT_FOUND');
			const result = await database.transaction(async (tx) => {
				await tx.execute(sql`select id from todos where id = ${id} for update`);
				const [existing] = await tx.select().from(todos).where(eq(todos.id, id)).limit(1);
				const now = new Date();
				if (!existing) {
					if (input.baseRevision !== 0) throw new SyncError('REVISION_CONFLICT', 0);
					validateStorageKeys(userId, input);
					await tx.insert(todos).values({
						id,
						ownerId: userId,
						text: null,
						status: input.status,
						revision: 1,
						createdAt: now,
						updatedAt: now,
						closedAt: input.status === 'closed' ? now : null
					});
					await replaceContent(tx, id, input, now);
					return { revision: 1, created: true };
				}
				if (existing.ownerId !== userId) throw new SyncError('NOT_FOUND');
				validateStorageKeys(userId, input);
				if (input.baseRevision !== existing.revision) {
					if (await contentMatches(tx, id, input.status, existing.status, input))
						return { revision: existing.revision, created: false, publish: false };
					throw new SyncError('REVISION_CONFLICT', existing.revision);
				}
				if (existing.deletedAt) throw new SyncError('NOT_FOUND');
				const revision = existing.revision + 1;
				await tx
					.update(todos)
					.set({
						status: input.status,
						revision,
						updatedAt: now,
						closedAt: input.status === 'closed' ? (existing.closedAt ?? now) : null,
						reopenedAt:
							existing.status === 'closed' && input.status === 'active' ? now : existing.reopenedAt
					})
					.where(eq(todos.id, id));
				if (existing.status === 'closed' && input.status === 'active')
					await tx
						.update(todoWorkers)
						.set({ state: 'doing', finishedAt: null })
						.where(eq(todoWorkers.todoId, id));
				await replaceContent(tx, id, input, now);
				const systemText =
					existing.status === 'active' && input.status === 'closed'
						? (name: string) => `${name} закрыл задачу`
						: existing.status === 'closed' && input.status === 'active'
							? (name: string) => `${name} снова открыл задачу`
							: (name: string) => `${name} изменил задачу`;
				await addSystemMessage(tx, { todoId: id, actorId: userId, text: systemText });
				return { revision, created: false, publish: true };
			});
			if (result.publish !== false)
				await publishToTodoUsers(id, {
					type: 'todo.changed',
					todoId: id,
					revision: result.revision
				});
			return { revision: result.revision, created: result.created };
		},

		async delete(userId: string, id: string, baseRevision: number) {
			const result = await database.transaction(async (tx) => {
				await tx.execute(sql`select id from todos where id = ${id} for update`);
				const [existing] = await tx.select().from(todos).where(eq(todos.id, id)).limit(1);
				if (!existing || existing.ownerId !== userId || existing.deletedAt)
					throw new SyncError('NOT_FOUND');
				if (existing.revision !== baseRevision)
					throw new SyncError('REVISION_CONFLICT', existing.revision);
				const revision = existing.revision + 1;
				const now = new Date();
				await tx
					.update(todos)
					.set({ revision, updatedAt: now, deletedAt: now })
					.where(eq(todos.id, id));
				return { revision, deletedAt: now };
			});
			await publishToTodoUsers(id, {
				type: 'todo.deleted',
				todoId: id,
				revision: result.revision
			});
			return result;
		}
	};
}

export const todoSyncService = createTodoSyncService();
