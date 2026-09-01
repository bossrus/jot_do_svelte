import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import { todoWorkers, todos, users } from '$lib/server/db/schema';
import { hasPlanCapability } from '$lib/server/permissions/plans';
import { addSystemMessage } from '$lib/server/sync/system-messages';
import { publishServerEvent, type PublishServerEvent } from '$lib/server/sync/events';
import { createTodoAccessHelpers } from './access';
import type { WorkerAction } from '$lib/todos/worker-contracts';
import { insertNotification } from '$lib/server/notifications/service';

type Database = typeof defaultDb;
export type WorkerErrorCode =
	'TODO_NOT_FOUND' | 'FORBIDDEN' | 'TODO_CLOSED' | 'TARGET_HAS_NO_ACCESS';
export class WorkerError extends Error {
	constructor(readonly code: WorkerErrorCode) {
		super(code);
	}
}

export function createWorkerService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent
) {
	const access = createTodoAccessHelpers(database);
	async function publishTodo(todoId: string, revision: number) {
		for (const userId of await access.getTodoAccessUserIds(todoId)) {
			await publish(userId, { type: 'todo.changed', todoId, revision });
			await publish(userId, { type: 'message.changed', todoId, revision });
		}
	}
	return {
		async mutate(actorId: string, todoId: string, input: WorkerAction) {
			const result = await database.transaction(async (tx) => {
				await tx.execute(sql`select id from todos where id = ${todoId} for update`);
				const [todo] = await tx
					.select()
					.from(todos)
					.where(and(eq(todos.id, todoId), sql`${todos.deletedAt} is null`))
					.limit(1);
				if (!todo) throw new WorkerError('TODO_NOT_FOUND');
				if (todo.status !== 'active') throw new WorkerError('TODO_CLOSED');
				const authorAction = input.action === 'assign' || input.action === 'remove';
				const targetId = input.targetUserId ?? actorId;
				if (authorAction) {
					if (todo.ownerId !== actorId) throw new WorkerError('FORBIDDEN');
					if (
						!(await createTodoAccessHelpers(tx as unknown as Database).canViewTodo(
							targetId,
							todoId
						))
					)
						throw new WorkerError('TARGET_HAS_NO_ACCESS');
				} else {
					if (
						!(await createTodoAccessHelpers(tx as unknown as Database).canViewTodo(actorId, todoId))
					)
						throw new WorkerError('FORBIDDEN');
					if (todo.ownerId !== actorId) {
						const [actor] = await tx
							.select({ plan: users.plan })
							.from(users)
							.where(eq(users.id, actorId))
							.limit(1);
						if (!actor || !hasPlanCapability(actor.plan, 'canJoinSharedTodo'))
							throw new WorkerError('FORBIDDEN');
					}
				}
				const [existing] = await tx
					.select()
					.from(todoWorkers)
					.where(and(eq(todoWorkers.todoId, todoId), eq(todoWorkers.userId, targetId)))
					.limit(1);
				let changed = false;
				let text: ((actorName: string) => string) | null = null;
				if (input.action === 'join' || input.action === 'assign') {
					if (!existing) {
						const hadWorkers = Boolean(
							(
								await tx
									.select({ userId: todoWorkers.userId })
									.from(todoWorkers)
									.where(eq(todoWorkers.todoId, todoId))
									.limit(1)
							)[0]
						);
						await tx.insert(todoWorkers).values({ todoId, userId: targetId });
						changed = true;
						if (input.action === 'assign') {
							const [target] = await tx
								.select({ name: users.displayName })
								.from(users)
								.where(eq(users.id, targetId))
								.limit(1);
							text = (name) => `${name} назначил ${target?.name ?? 'пользователя'} исполнителем`;
						} else
							text = (name) =>
								hadWorkers ? `${name} тоже взял задачу в работу` : `${name} взял задачу в работу`;
					}
				} else if (input.action === 'complete' && existing?.state === 'doing') {
					await tx
						.update(todoWorkers)
						.set({ state: 'done', finishedAt: new Date() })
						.where(and(eq(todoWorkers.todoId, todoId), eq(todoWorkers.userId, targetId)));
					changed = true;
					text = (name) => `${name} завершил работу`;
				} else if (input.action === 'resume' && existing?.state === 'done') {
					await tx
						.update(todoWorkers)
						.set({ state: 'doing', finishedAt: null })
						.where(and(eq(todoWorkers.todoId, todoId), eq(todoWorkers.userId, targetId)));
					changed = true;
					text = (name) => `${name} вернулся к работе`;
				} else if ((input.action === 'leave' || input.action === 'remove') && existing) {
					await tx
						.delete(todoWorkers)
						.where(and(eq(todoWorkers.todoId, todoId), eq(todoWorkers.userId, targetId)));
					changed = true;
					if (input.action === 'remove') {
						const [target] = await tx
							.select({ name: users.displayName })
							.from(users)
							.where(eq(users.id, targetId))
							.limit(1);
						text = (name) => `${name} убрал ${target?.name ?? 'пользователя'} из исполнителей`;
					} else text = (name) => `${name} покинул задачу`;
				}
				let revision = todo.revision;
				if (changed) {
					revision++;
					await tx
						.update(todos)
						.set({ revision, updatedAt: new Date() })
						.where(eq(todos.id, todoId));
					if (text) await addSystemMessage(tx, { todoId, actorId, text });
					const notification =
						input.action === 'assign'
							? { userId: targetId, type: 'worker.assigned' as const }
							: input.action === 'remove'
								? { userId: targetId, type: 'worker.removed' as const }
								: input.action === 'join'
									? { userId: todo.ownerId, type: 'worker.started' as const }
									: input.action === 'complete'
										? { userId: todo.ownerId, type: 'worker.completed' as const }
										: input.action === 'leave'
											? { userId: todo.ownerId, type: 'worker.left' as const }
											: null;
					if (notification)
						await insertNotification(tx, {
							...notification,
							actorUserId: actorId,
							todoId,
							dedupeKey: `worker:${input.action}:${todoId}:${targetId}:${revision}`
						});
					return { changed, revision, notificationUserId: notification?.userId ?? null };
				}
				return { changed, revision, notificationUserId: null };
			});
			if (result.changed) {
				await publishTodo(todoId, result.revision);
				if (result.notificationUserId && result.notificationUserId !== actorId)
					await publish(result.notificationUserId, { type: 'notifications.changed' });
			}
			return result;
		}
	};
}
export const workerService = createWorkerService();
