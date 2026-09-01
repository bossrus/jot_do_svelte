import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	contacts,
	friendRequestGroups,
	friendRequests,
	todoAccessRequests,
	todoAccessRevocations,
	todoShareLinks,
	todoUserAccess,
	todos,
	users
} from '$lib/server/db/schema';
import { publishServerEvent, type PublishServerEvent } from '$lib/server/sync/events';
import { hasPlanCapability } from '$lib/server/permissions/plans';

type Database = typeof defaultDb;
export type TodoInviteErrorCode =
	| 'TODO_NOT_FOUND'
	| 'INVITE_NOT_FOUND'
	| 'REQUEST_NOT_FOUND'
	| 'REQUEST_NOT_PENDING'
	| 'FORBIDDEN'
	| 'INVALID_GROUPS'
	| 'PARTICIPANT_PLAN_REQUIRED';
export class TodoInviteError extends Error {
	constructor(readonly code: TodoInviteErrorCode) {
		super(code);
	}
}

export const hashTodoInviteToken = (token: string) =>
	createHash('sha256').update(token).digest('hex');
export const createTodoInviteToken = () => randomBytes(32).toString('base64url');

export function createTodoInviteService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent
) {
	async function findInvite(token: string) {
		const [row] = await database
			.select({ todoId: todos.id, ownerId: todos.ownerId, ownerName: users.displayName })
			.from(todoShareLinks)
			.innerJoin(todos, eq(todos.id, todoShareLinks.todoId))
			.innerJoin(users, eq(users.id, todos.ownerId))
			.where(and(eq(todoShareLinks.tokenHash, hashTodoInviteToken(token)), isNull(todos.deletedAt)))
			.limit(1);
		return row ?? null;
	}

	return {
		async linkStatus(ownerId: string, todoId: string) {
			const [todo] = await database
				.select({ id: todos.id })
				.from(todos)
				.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId), isNull(todos.deletedAt)))
				.limit(1);
			if (!todo) throw new TodoInviteError('TODO_NOT_FOUND');
			const [link] = await database
				.select({ id: todoShareLinks.id })
				.from(todoShareLinks)
				.where(eq(todoShareLinks.todoId, todoId))
				.limit(1);
			return { active: Boolean(link) };
		},

		async rotateLink(ownerId: string, todoId: string) {
			const token = createTodoInviteToken();
			await database.transaction(async (tx) => {
				const [todo] = await tx
					.select({ id: todos.id })
					.from(todos)
					.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId), isNull(todos.deletedAt)))
					.limit(1);
				if (!todo) throw new TodoInviteError('TODO_NOT_FOUND');
				await tx
					.insert(todoShareLinks)
					.values({ todoId, tokenHash: hashTodoInviteToken(token) })
					.onConflictDoUpdate({
						target: todoShareLinks.todoId,
						set: { tokenHash: hashTodoInviteToken(token), updatedAt: new Date() }
					});
			});
			return { active: true, token };
		},

		async disableLink(ownerId: string, todoId: string) {
			const [todo] = await database
				.select({ id: todos.id })
				.from(todos)
				.where(and(eq(todos.id, todoId), eq(todos.ownerId, ownerId), isNull(todos.deletedAt)))
				.limit(1);
			if (!todo) throw new TodoInviteError('TODO_NOT_FOUND');
			await database.delete(todoShareLinks).where(eq(todoShareLinks.todoId, todoId));
			return { active: false };
		},

		async preview(token: string, userId: string | null) {
			const invite = await findInvite(token);
			if (!invite) return { state: 'invalid' as const, owner: null, todoId: null };
			const base = { owner: { name: invite.ownerName }, todoId: invite.todoId };
			if (!userId) return { state: 'loginRequired' as const, ...base };
			if (userId === invite.ownerId) return { state: 'owner' as const, ...base };
			const [access] = await database
				.select({ userId: todoUserAccess.userId })
				.from(todoUserAccess)
				.where(and(eq(todoUserAccess.todoId, invite.todoId), eq(todoUserAccess.userId, userId)))
				.limit(1);
			if (access) return { state: 'hasAccess' as const, ...base };
			const [request] = await database
				.select({ status: todoAccessRequests.status })
				.from(todoAccessRequests)
				.where(
					and(
						eq(todoAccessRequests.todoId, invite.todoId),
						eq(todoAccessRequests.requesterId, userId)
					)
				)
				.orderBy(desc(todoAccessRequests.createdAt))
				.limit(1);
			return {
				state:
					request?.status === 'pending'
						? ('pending' as const)
						: request?.status === 'rejected'
							? ('rejected' as const)
							: ('canRequest' as const),
				...base
			};
		},

		async request(token: string, requesterId: string) {
			const invite = await findInvite(token);
			if (!invite) throw new TodoInviteError('INVITE_NOT_FOUND');
			if (invite.ownerId === requesterId) return { state: 'owner' as const, todoId: invite.todoId };
			const result = await database.transaction(async (tx) => {
				const [access] = await tx
					.select({ userId: todoUserAccess.userId })
					.from(todoUserAccess)
					.where(
						and(eq(todoUserAccess.todoId, invite.todoId), eq(todoUserAccess.userId, requesterId))
					)
					.limit(1);
				if (access) return { state: 'hasAccess' as const, created: false };
				const [pending] = await tx
					.select({ id: todoAccessRequests.id })
					.from(todoAccessRequests)
					.where(
						and(
							eq(todoAccessRequests.todoId, invite.todoId),
							eq(todoAccessRequests.requesterId, requesterId),
							eq(todoAccessRequests.status, 'pending')
						)
					)
					.limit(1);
				if (pending) return { state: 'pending' as const, created: false };
				const [rejected] = await tx
					.select({ id: todoAccessRequests.id })
					.from(todoAccessRequests)
					.where(
						and(
							eq(todoAccessRequests.todoId, invite.todoId),
							eq(todoAccessRequests.requesterId, requesterId),
							eq(todoAccessRequests.status, 'rejected')
						)
					)
					.orderBy(desc(todoAccessRequests.createdAt))
					.limit(1);
				if (rejected)
					await tx
						.update(todoAccessRequests)
						.set({ status: 'pending', createdAt: new Date(), resolvedAt: null })
						.where(eq(todoAccessRequests.id, rejected.id));
				else await tx.insert(todoAccessRequests).values({ todoId: invite.todoId, requesterId });
				return { state: 'pending' as const, created: true };
			});
			if (result.created) await publish(invite.ownerId, { type: 'todo-access-request.changed' });
			return { state: result.state, todoId: invite.todoId };
		},

		async listPending(ownerId: string) {
			const rows = await database
				.select({
					id: todoAccessRequests.id,
					todoId: todoAccessRequests.todoId,
					requesterId: users.id,
					email: users.email,
					name: users.displayName,
					plan: users.plan,
					createdAt: todoAccessRequests.createdAt,
					friendId: contacts.contactId
				})
				.from(todoAccessRequests)
				.innerJoin(todos, eq(todos.id, todoAccessRequests.todoId))
				.innerJoin(users, eq(users.id, todoAccessRequests.requesterId))
				.leftJoin(
					contacts,
					and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, todoAccessRequests.requesterId))
				)
				.where(
					and(
						eq(todos.ownerId, ownerId),
						isNull(todos.deletedAt),
						eq(todoAccessRequests.status, 'pending')
					)
				)
				.orderBy(desc(todoAccessRequests.createdAt));
			return {
				requests: rows.map((row) => ({
					id: row.id,
					todoId: row.todoId,
					requester: { userId: row.requesterId, email: row.email, name: row.name, plan: row.plan },
					requesterIsFriend: Boolean(row.friendId),
					createdAt: row.createdAt
				}))
			};
		},

		async reject(requestId: string, ownerId: string) {
			const [row] = await database
				.update(todoAccessRequests)
				.set({ status: 'rejected', resolvedAt: new Date() })
				.from(todos)
				.where(
					and(
						eq(todoAccessRequests.id, requestId),
						eq(todoAccessRequests.status, 'pending'),
						eq(todos.id, todoAccessRequests.todoId),
						eq(todos.ownerId, ownerId),
						isNull(todos.deletedAt)
					)
				)
				.returning({ requesterId: todoAccessRequests.requesterId });
			if (!row) throw new TodoInviteError('REQUEST_NOT_PENDING');
			await publish(row.requesterId, { type: 'todo-access-request.changed' });
			return { id: requestId, status: 'rejected' as const };
		},

		async accept(requestId: string, ownerId: string, addFriend: boolean, rawGroupIds: string[]) {
			const groupIds = [...new Set(rawGroupIds)];
			const result = await database.transaction(async (tx) => {
				const [request] = await tx
					.select({
						requesterId: todoAccessRequests.requesterId,
						todoId: todoAccessRequests.todoId,
						requesterPlan: users.plan
					})
					.from(todoAccessRequests)
					.innerJoin(todos, eq(todos.id, todoAccessRequests.todoId))
					.innerJoin(users, eq(users.id, todoAccessRequests.requesterId))
					.where(
						and(
							eq(todoAccessRequests.id, requestId),
							eq(todoAccessRequests.status, 'pending'),
							eq(todos.ownerId, ownerId),
							isNull(todos.deletedAt)
						)
					)
					.limit(1);
				if (!request) throw new TodoInviteError('REQUEST_NOT_PENDING');
				if (!hasPlanCapability(request.requesterPlan, 'canJoinSharedTodo'))
					throw new TodoInviteError('PARTICIPANT_PLAN_REQUIRED');
				if (!addFriend && groupIds.length) throw new TodoInviteError('INVALID_GROUPS');
				if (groupIds.length) {
					const groups = await tx
						.select({ id: contactGroups.id })
						.from(contactGroups)
						.where(and(eq(contactGroups.ownerId, ownerId), inArray(contactGroups.id, groupIds)));
					if (groups.length !== groupIds.length) throw new TodoInviteError('INVALID_GROUPS');
				}
				await tx
					.insert(todoUserAccess)
					.values({ todoId: request.todoId, userId: request.requesterId, grantedBy: ownerId })
					.onConflictDoNothing();
				await tx
					.delete(todoAccessRevocations)
					.where(
						and(
							eq(todoAccessRevocations.todoId, request.todoId),
							eq(todoAccessRevocations.userId, request.requesterId)
						)
					);
				await tx.update(todos).set({ isShared: true }).where(eq(todos.id, request.todoId));
				if (addFriend) {
					const [friend] = await tx
						.select({ id: contacts.contactId })
						.from(contacts)
						.where(and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, request.requesterId)))
						.limit(1);
					if (friend) {
						await tx
							.delete(contactGroupMembers)
							.where(
								and(
									eq(contactGroupMembers.ownerId, ownerId),
									eq(contactGroupMembers.userId, request.requesterId)
								)
							);
						if (groupIds.length)
							await tx
								.insert(contactGroupMembers)
								.values(
									groupIds.map((groupId) => ({ ownerId, groupId, userId: request.requesterId }))
								);
					} else {
						let [friendRequest] = await tx
							.select({ id: friendRequests.id })
							.from(friendRequests)
							.where(
								and(
									eq(friendRequests.senderUserId, ownerId),
									eq(friendRequests.recipientUserId, request.requesterId),
									eq(friendRequests.status, 'pending')
								)
							)
							.limit(1);
						if (!friendRequest)
							[friendRequest] = await tx
								.insert(friendRequests)
								.values({ senderUserId: ownerId, recipientUserId: request.requesterId })
								.returning({ id: friendRequests.id });
						await tx
							.delete(friendRequestGroups)
							.where(eq(friendRequestGroups.requestId, friendRequest.id));
						if (groupIds.length)
							await tx
								.insert(friendRequestGroups)
								.values(groupIds.map((groupId) => ({ requestId: friendRequest.id, groupId })));
					}
				}
				await tx
					.update(todoAccessRequests)
					.set({ status: 'approved', resolvedAt: new Date() })
					.where(eq(todoAccessRequests.id, requestId));
				return request;
			});
			await publish(result.requesterId, { type: 'todo.access-changed', todoId: result.todoId });
			await publish(result.requesterId, { type: 'todo-access-request.changed' });
			if (addFriend) await publish(result.requesterId, { type: 'friend-request.changed' });
			return { id: requestId, status: 'accepted' as const, todoId: result.todoId };
		}
	};
}

export const todoInviteService = createTodoInviteService();
