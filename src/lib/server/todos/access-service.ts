import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	contacts,
	contactGroupMembers,
	contactGroups,
	todoAccessRevocations,
	todoGroupAccess,
	todoUserAccess,
	todoWorkers,
	todos,
	users
} from '$lib/server/db/schema';
import { publishServerEvent, type PublishServerEvent } from '$lib/server/sync/events';
import { hasPlanCapability } from '$lib/server/permissions/plans';
import { addSystemMessage } from '$lib/server/sync/system-messages';
import { createTodoAccessHelpers } from './access';
import { insertNotification } from '$lib/server/notifications/service';

type Database = typeof defaultDb;
export type TodoAccessErrorCode =
	'TODO_NOT_FOUND' | 'INVALID_PARTICIPANTS' | 'PARTICIPANT_PLAN_REQUIRED';

export class TodoAccessError extends Error {
	constructor(readonly code: TodoAccessErrorCode) {
		super(code);
	}
}

export function createTodoAccessService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent
) {
	const access = createTodoAccessHelpers(database);
	async function effectiveParticipants(
		databaseOrTx: Pick<Database, 'select' | 'selectDistinct'>,
		todoId: string
	) {
		return databaseOrTx
			.selectDistinct({ userId: users.id, email: users.email, name: users.displayName })
			.from(users)
			.leftJoin(
				todoUserAccess,
				and(eq(todoUserAccess.userId, users.id), eq(todoUserAccess.todoId, todoId))
			)
			.leftJoin(contactGroupMembers, eq(contactGroupMembers.userId, users.id))
			.leftJoin(
				todoGroupAccess,
				and(
					eq(todoGroupAccess.groupId, contactGroupMembers.groupId),
					eq(todoGroupAccess.todoId, todoId)
				)
			)
			.where(or(isNotNull(todoUserAccess.userId), isNotNull(todoGroupAccess.groupId)));
	}
	return {
		async list(ownerId: string, todoId: string) {
			const [ownedTodo] = await database
				.select({ id: todos.id })
				.from(todos)
				.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId)))
				.limit(1);
			if (!ownedTodo) throw new TodoAccessError('TODO_NOT_FOUND');
			const directParticipants = await database
				.select({ userId: users.id, email: users.email, name: users.displayName })
				.from(todoUserAccess)
				.innerJoin(users, eq(users.id, todoUserAccess.userId))
				.where(eq(todoUserAccess.todoId, todoId));
			const groups = await database
				.select({ groupId: todoGroupAccess.groupId })
				.from(todoGroupAccess)
				.where(eq(todoGroupAccess.todoId, todoId));
			const [effective, workers] = await Promise.all([
				effectiveParticipants(database, todoId),
				database
					.select({ userId: users.id, email: users.email, name: users.displayName })
					.from(todoWorkers)
					.innerJoin(users, eq(users.id, todoWorkers.userId))
					.where(and(eq(todoWorkers.todoId, todoId), ne(todoWorkers.userId, ownerId)))
			]);
			return {
				directParticipants,
				groupIds: groups.map((row) => row.groupId),
				effectiveParticipants: effective,
				availableParticipants: [
					...new Map(
						[...effective, ...workers].map((participant) => [participant.userId, participant])
					).values()
				]
			};
		},
		async set(ownerId: string, todoId: string, rawUserIds: string[], rawGroupIds: string[] = []) {
			const requested = [...new Set(rawUserIds)];
			const requestedGroups = [...new Set(rawGroupIds)];
			if (requested.includes(ownerId)) throw new TodoAccessError('INVALID_PARTICIPANTS');
			const changed = await database.transaction(async (tx) => {
				await tx.execute(sql`select id from todos where id = ${todoId} for update`);
				const [ownedTodo] = await tx
					.select({ id: todos.id })
					.from(todos)
					.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId)))
					.limit(1);
				if (!ownedTodo) throw new TodoAccessError('TODO_NOT_FOUND');
				if (requestedGroups.length) {
					const ownedGroups = await tx
						.select({ id: contactGroups.id })
						.from(contactGroups)
						.where(
							and(eq(contactGroups.ownerId, ownerId), inArray(contactGroups.id, requestedGroups))
						);
					if (ownedGroups.length !== requestedGroups.length)
						throw new TodoAccessError('INVALID_PARTICIPANTS');
				}
				const before = new Set((await effectiveParticipants(tx, todoId)).map((row) => row.userId));
				const existingRows = await tx
					.select({ userId: todoUserAccess.userId })
					.from(todoUserAccess)
					.where(eq(todoUserAccess.todoId, todoId));
				const existing = new Set(existingRows.map((row) => row.userId));
				const added = requested.filter((id) => !existing.has(id));
				const removed = [...existing].filter((id) => !requested.includes(id));
				if (added.length) {
					const friends = await tx
						.select({ userId: contacts.contactId })
						.from(contacts)
						.where(and(eq(contacts.ownerId, ownerId), inArray(contacts.contactId, added)));
					const knownParticipants = await tx
						.selectDistinct({ userId: todoUserAccess.userId })
						.from(todoUserAccess)
						.innerJoin(todos, eq(todos.id, todoUserAccess.todoId))
						.where(and(eq(todos.ownerId, ownerId), inArray(todoUserAccess.userId, added)));
					const knownWorkers = await tx
						.selectDistinct({ userId: todoWorkers.userId })
						.from(todoWorkers)
						.innerJoin(todos, eq(todos.id, todoWorkers.todoId))
						.where(and(eq(todos.ownerId, ownerId), inArray(todoWorkers.userId, added)));
					const allowed = new Set([
						...friends.map((row) => row.userId),
						...knownParticipants.map((row) => row.userId),
						...knownWorkers.map((row) => row.userId)
					]);
					if (added.some((id) => !allowed.has(id)))
						throw new TodoAccessError('INVALID_PARTICIPANTS');
				}
				const candidateIds = added;
				if (candidateIds.length) {
					const candidates = await tx
						.select({ id: users.id, plan: users.plan })
						.from(users)
						.where(inArray(users.id, candidateIds));
					if (
						candidates.length !== candidateIds.length ||
						candidates.some((user) => !hasPlanCapability(user.plan, 'canJoinSharedTodo'))
					)
						throw new TodoAccessError('PARTICIPANT_PLAN_REQUIRED');
				}
				if (added.length) {
					await tx
						.insert(todoUserAccess)
						.values(added.map((userId) => ({ todoId, userId, grantedBy: ownerId })));
					await tx
						.delete(todoAccessRevocations)
						.where(
							and(
								eq(todoAccessRevocations.todoId, todoId),
								inArray(todoAccessRevocations.userId, added)
							)
						);
				}
				if (removed.length)
					await tx
						.delete(todoUserAccess)
						.where(and(eq(todoUserAccess.todoId, todoId), inArray(todoUserAccess.userId, removed)));
				await tx.delete(todoGroupAccess).where(eq(todoGroupAccess.todoId, todoId));
				if (requestedGroups.length)
					await tx
						.insert(todoGroupAccess)
						.values(requestedGroups.map((groupId) => ({ todoId, groupId })));
				const after = new Set((await effectiveParticipants(tx, todoId)).map((row) => row.userId));
				const gained = [...after].filter((id) => !before.has(id));
				const lost = [...before].filter((id) => !after.has(id));
				if (gained.length)
					await tx
						.delete(todoAccessRevocations)
						.where(
							and(
								eq(todoAccessRevocations.todoId, todoId),
								inArray(todoAccessRevocations.userId, gained)
							)
						);
				if (lost.length)
					await tx
						.insert(todoAccessRevocations)
						.values(lost.map((userId) => ({ todoId, userId })))
						.onConflictDoUpdate({
							target: [todoAccessRevocations.todoId, todoAccessRevocations.userId],
							set: { revokedAt: new Date() }
						});
				for (const userId of added)
					await insertNotification(tx, {
						userId,
						actorUserId: ownerId,
						type: 'todo.access-granted',
						todoId,
						dedupeKey: `access-granted:${todoId}:${userId}`
					});
				for (const userId of lost)
					await insertNotification(tx, {
						userId,
						actorUserId: ownerId,
						type: 'todo.access-revoked',
						todoId,
						dedupeKey: `access-revoked:${todoId}:${userId}:${Date.now()}`
					});
				await tx
					.update(todos)
					.set({ isShared: requested.length > 0 || requestedGroups.length > 0 })
					.where(eq(todos.id, todoId));
				if (gained.length || lost.length)
					await addSystemMessage(tx, {
						todoId,
						actorId: ownerId,
						text: (name) => `${name} изменил доступ к задаче`
					});
				return { gained, lost, notified: [...new Set([...added, ...lost])] };
			});
			for (const userId of changed.notified)
				await publish(userId, { type: 'notifications.changed' });
			for (const userId of changed.gained)
				await publish(userId, { type: 'todo.access-changed', todoId });
			for (const userId of changed.lost)
				await publish(userId, { type: 'todo.access-revoked', todoId });
			for (const userId of await access.getTodoAccessUserIds(todoId))
				await publish(userId, { type: 'message.changed', todoId, revision: 1 });
			return { todoId, userIds: requested, groupIds: requestedGroups };
		}
	};
}

export const todoAccessService = createTodoAccessService();
