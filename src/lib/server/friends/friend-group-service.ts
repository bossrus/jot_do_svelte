import { and, asc, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	contacts,
	todoAccessRevocations,
	todoGroupAccess
} from '$lib/server/db/schema';
import { publishServerEvent, type PublishServerEvent } from '$lib/server/sync/events';
import { createTodoAccessHelpers } from '$lib/server/todos/access';
import { insertNotification } from '$lib/server/notifications/service';

type Database = typeof defaultDb;
export type FriendGroupErrorCode =
	'GROUP_NOT_FOUND' | 'GROUP_NAME_TAKEN' | 'FRIEND_NOT_FOUND' | 'INVALID_GROUPS';

export class FriendGroupError extends Error {
	constructor(readonly code: FriendGroupErrorCode) {
		super(code);
	}
}

function unique(ids: string[]) {
	return [...new Set(ids)];
}

function isUniqueViolation(cause: unknown) {
	return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505');
}

export function createFriendGroupService(
	database: Database = defaultDb,
	publish: PublishServerEvent = publishServerEvent
) {
	const access = createTodoAccessHelpers(database);
	async function assertGroupsOwned(ownerId: string, groupIds: string[]) {
		const ids = unique(groupIds);
		if (!ids.length) return ids;
		const rows = await database
			.select({ id: contactGroups.id })
			.from(contactGroups)
			.where(and(eq(contactGroups.ownerId, ownerId), inArray(contactGroups.id, ids)));
		if (rows.length !== ids.length) throw new FriendGroupError('INVALID_GROUPS');
		return ids;
	}

	return {
		async list(ownerId: string) {
			const [groups, members] = await Promise.all([
				database
					.select()
					.from(contactGroups)
					.where(eq(contactGroups.ownerId, ownerId))
					.orderBy(asc(contactGroups.name), asc(contactGroups.createdAt)),
				database
					.select({ groupId: contactGroupMembers.groupId, userId: contactGroupMembers.userId })
					.from(contactGroupMembers)
					.where(eq(contactGroupMembers.ownerId, ownerId))
			]);
			const byGroup = new Map<string, string[]>();
			for (const member of members) {
				const list = byGroup.get(member.groupId) ?? [];
				list.push(member.userId);
				byGroup.set(member.groupId, list);
			}
			return {
				groups: groups.map((group) => ({ ...group, memberUserIds: byGroup.get(group.id) ?? [] }))
			};
		},

		async create(ownerId: string, name: string) {
			try {
				const [group] = await database
					.insert(contactGroups)
					.values({ ownerId, name: name.trim() })
					.returning();
				return { ...group, memberUserIds: [] };
			} catch (cause) {
				if (isUniqueViolation(cause)) throw new FriendGroupError('GROUP_NAME_TAKEN');
				throw cause;
			}
		},

		async rename(ownerId: string, id: string, name: string) {
			try {
				const [group] = await database
					.update(contactGroups)
					.set({ name: name.trim(), updatedAt: new Date() })
					.where(and(eq(contactGroups.id, id), eq(contactGroups.ownerId, ownerId)))
					.returning();
				if (!group) throw new FriendGroupError('GROUP_NOT_FOUND');
				const members = await database
					.select({ userId: contactGroupMembers.userId })
					.from(contactGroupMembers)
					.where(
						and(eq(contactGroupMembers.ownerId, ownerId), eq(contactGroupMembers.groupId, id))
					);
				return { ...group, memberUserIds: members.map((member) => member.userId) };
			} catch (cause) {
				if (isUniqueViolation(cause)) throw new FriendGroupError('GROUP_NAME_TAKEN');
				throw cause;
			}
		},

		async remove(ownerId: string, id: string) {
			const result = await database.transaction(async (tx) => {
				const [group] = await tx
					.select({ id: contactGroups.id, name: contactGroups.name })
					.from(contactGroups)
					.where(and(eq(contactGroups.id, id), eq(contactGroups.ownerId, ownerId)))
					.limit(1);
				if (!group) return { deleted: [], members: [] as string[] };
				const members = (
					await tx
						.select({ userId: contactGroupMembers.userId })
						.from(contactGroupMembers)
						.where(eq(contactGroupMembers.groupId, id))
				).map((r) => r.userId);
				for (const userId of members)
					await insertNotification(tx, {
						userId,
						actorUserId: ownerId,
						type: 'group.removed',
						groupId: id,
						payload: { groupName: group.name },
						dedupeKey: `group-removed:${id}:${userId}:${Date.now()}`
					});
				const deleted = await tx
					.delete(contactGroups)
					.where(and(eq(contactGroups.id, id), eq(contactGroups.ownerId, ownerId)))
					.returning({ id: contactGroups.id });
				return { deleted, members };
			});
			if (!result.deleted.length) throw new FriendGroupError('GROUP_NOT_FOUND');
			for (const userId of result.members) {
				await publish(userId, { type: 'groups.changed' });
				await publish(userId, { type: 'notifications.changed' });
			}
			return { id, removed: true as const };
		},

		async setFriendGroups(ownerId: string, userId: string, rawGroupIds: string[]) {
			const groupIds = await assertGroupsOwned(ownerId, rawGroupIds);
			const changed = await database.transaction(async (tx) => {
				const [friend] = await tx
					.select({ userId: contacts.contactId })
					.from(contacts)
					.where(and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, userId)))
					.limit(1);
				if (!friend) throw new FriendGroupError('FRIEND_NOT_FOUND');
				const before = await tx
					.select({ todoId: todoGroupAccess.todoId })
					.from(todoGroupAccess)
					.innerJoin(contactGroupMembers, eq(contactGroupMembers.groupId, todoGroupAccess.groupId))
					.where(
						and(eq(contactGroupMembers.ownerId, ownerId), eq(contactGroupMembers.userId, userId))
					);
				const beforeGroups = await tx
					.select({ groupId: contactGroupMembers.groupId })
					.from(contactGroupMembers)
					.where(
						and(eq(contactGroupMembers.ownerId, ownerId), eq(contactGroupMembers.userId, userId))
					);
				await tx
					.delete(contactGroupMembers)
					.where(
						and(eq(contactGroupMembers.ownerId, ownerId), eq(contactGroupMembers.userId, userId))
					);
				if (groupIds.length)
					await tx
						.insert(contactGroupMembers)
						.values(groupIds.map((groupId) => ({ ownerId, groupId, userId })));
				const after = await tx
					.select({ todoId: todoGroupAccess.todoId })
					.from(todoGroupAccess)
					.innerJoin(contactGroupMembers, eq(contactGroupMembers.groupId, todoGroupAccess.groupId))
					.where(
						and(eq(contactGroupMembers.ownerId, ownerId), eq(contactGroupMembers.userId, userId))
					);
				const previousIds = new Set(beforeGroups.map((row) => row.groupId));
				const addedGroups = groupIds.filter((groupId) => !previousIds.has(groupId));
				const removedGroups = [...previousIds].filter((groupId) => !groupIds.includes(groupId));
				const changedGroupIds = [...addedGroups, ...removedGroups];
				const names = changedGroupIds.length
					? await tx
							.select({ id: contactGroups.id, name: contactGroups.name })
							.from(contactGroups)
							.where(inArray(contactGroups.id, changedGroupIds))
					: [];
				const namesById = new Map(names.map((group) => [group.id, group.name]));
				for (const groupId of addedGroups)
					await insertNotification(tx, {
						userId,
						actorUserId: ownerId,
						type: 'group.added',
						groupId,
						payload: { groupName: namesById.get(groupId) ?? 'Группа' },
						dedupeKey: `group-added:${groupId}:${userId}:${Date.now()}`
					});
				for (const groupId of removedGroups)
					await insertNotification(tx, {
						userId,
						actorUserId: ownerId,
						type: 'group.removed',
						groupId,
						payload: { groupName: namesById.get(groupId) ?? 'Группа' },
						dedupeKey: `group-removed:${groupId}:${userId}:${Date.now()}`
					});
				return {
					userId,
					groupIds,
					before: new Set(before.map((row) => row.todoId)),
					after: new Set(after.map((row) => row.todoId)),
					groupsChanged: changedGroupIds.length > 0
				};
			});
			if (changed.groupsChanged) {
				await publish(userId, { type: 'groups.changed' });
				await publish(userId, { type: 'notifications.changed' });
			}
			for (const todoId of changed.after) {
				if (changed.before.has(todoId)) continue;
				await database
					.delete(todoAccessRevocations)
					.where(
						and(eq(todoAccessRevocations.todoId, todoId), eq(todoAccessRevocations.userId, userId))
					);
				await publish(userId, { type: 'todo.access-changed', todoId });
			}
			for (const todoId of changed.before) {
				if (changed.after.has(todoId) || (await access.canViewTodo(userId, todoId))) continue;
				await database
					.insert(todoAccessRevocations)
					.values({ todoId, userId })
					.onConflictDoUpdate({
						target: [todoAccessRevocations.todoId, todoAccessRevocations.userId],
						set: { revokedAt: new Date() }
					});
				await publish(userId, { type: 'todo.access-revoked', todoId });
			}
			return { userId, groupIds };
		},

		assertGroupsOwned
	};
}

export const friendGroupService = createFriendGroupService();
