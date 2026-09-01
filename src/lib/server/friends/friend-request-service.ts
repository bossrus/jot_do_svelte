import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	contacts,
	friendRequestGroups,
	friendRequests,
	removedContacts,
	users
} from '$lib/server/db/schema';

type Database = typeof defaultDb;
export type FriendRequestErrorCode =
	| 'USER_NOT_FOUND'
	| 'CANNOT_ADD_SELF'
	| 'REQUEST_NOT_FOUND'
	| 'FORBIDDEN'
	| 'REQUEST_NOT_PENDING'
	| 'INVALID_GROUPS';
export class FriendRequestError extends Error {
	constructor(readonly code: FriendRequestErrorCode) {
		super(code);
	}
}

const outgoingSelection = {
	id: friendRequests.id,
	userId: users.id,
	email: users.email,
	name: users.displayName,
	createdAt: friendRequests.createdAt
};

function isUniqueViolation(cause: unknown) {
	return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505');
}

export function createFriendRequestService(database: Database = defaultDb) {
	async function ownedGroupIds(ownerId: string, rawIds: string[]) {
		const ids = [...new Set(rawIds)];
		if (!ids.length) return ids;
		const groups = await database
			.select({ id: contactGroups.id })
			.from(contactGroups)
			.where(and(eq(contactGroups.ownerId, ownerId), inArray(contactGroups.id, ids)));
		if (groups.length !== ids.length) throw new FriendRequestError('INVALID_GROUPS');
		return ids;
	}

	async function replaceRequestGroups(requestId: string, groupIds: string[]) {
		await database.transaction(async (tx) => {
			await tx.delete(friendRequestGroups).where(eq(friendRequestGroups.requestId, requestId));
			if (groupIds.length)
				await tx
					.insert(friendRequestGroups)
					.values(groupIds.map((groupId) => ({ requestId, groupId })));
		});
	}
	async function pendingOutgoing(senderUserId: string, recipientUserId: string) {
		const [row] = await database
			.select(outgoingSelection)
			.from(friendRequests)
			.innerJoin(users, eq(users.id, friendRequests.recipientUserId))
			.where(
				and(
					eq(friendRequests.senderUserId, senderUserId),
					eq(friendRequests.recipientUserId, recipientUserId),
					eq(friendRequests.status, 'pending')
				)
			)
			.limit(1);
		return row
			? {
					id: row.id,
					recipient: { userId: row.userId, email: row.email, name: row.name },
					createdAt: row.createdAt
				}
			: null;
	}

	return {
		async listIncoming(recipientUserId: string) {
			const rows = await database
				.select(outgoingSelection)
				.from(friendRequests)
				.innerJoin(users, eq(users.id, friendRequests.senderUserId))
				.where(
					and(
						eq(friendRequests.recipientUserId, recipientUserId),
						eq(friendRequests.status, 'pending'),
						isNull(users.deletedAt)
					)
				)
				.orderBy(desc(friendRequests.createdAt));
			return {
				requests: rows.map((row) => ({
					id: row.id,
					sender: { userId: row.userId, email: row.email, name: row.name },
					createdAt: row.createdAt
				}))
			};
		},

		async listOutgoing(senderUserId: string) {
			const rows = await database
				.select(outgoingSelection)
				.from(friendRequests)
				.innerJoin(users, eq(users.id, friendRequests.recipientUserId))
				.where(
					and(
						eq(friendRequests.senderUserId, senderUserId),
						eq(friendRequests.status, 'pending'),
						isNull(users.deletedAt)
					)
				)
				.orderBy(desc(friendRequests.createdAt));
			return {
				requests: rows.map((row) => ({
					id: row.id,
					recipient: { userId: row.userId, email: row.email, name: row.name },
					createdAt: row.createdAt
				}))
			};
		},

		async create(senderUserId: string, rawEmail: string, rawGroupIds: string[] = []) {
			const groupIds = await ownedGroupIds(senderUserId, rawGroupIds);
			const email = rawEmail.trim().toLowerCase();
			const [recipient] = await database
				.select({ id: users.id, email: users.email, name: users.displayName })
				.from(users)
				.where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
				.limit(1);
			if (!recipient) throw new FriendRequestError('USER_NOT_FOUND');
			if (recipient.id === senderUserId) throw new FriendRequestError('CANNOT_ADD_SELF');
			const [friend] = await database
				.select({ id: contacts.contactId })
				.from(contacts)
				.where(and(eq(contacts.ownerId, senderUserId), eq(contacts.contactId, recipient.id)))
				.limit(1);
			if (friend) {
				await database.transaction(async (tx) => {
					await tx
						.delete(contactGroupMembers)
						.where(
							and(
								eq(contactGroupMembers.ownerId, senderUserId),
								eq(contactGroupMembers.userId, recipient.id)
							)
						);
					if (groupIds.length)
						await tx.insert(contactGroupMembers).values(
							groupIds.map((groupId) => ({
								ownerId: senderUserId,
								groupId,
								userId: recipient.id
							}))
						);
				});
				return { result: 'alreadyFriend' as const, recipientUserId: recipient.id };
			}
			const existing = await pendingOutgoing(senderUserId, recipient.id);
			if (existing) {
				await replaceRequestGroups(existing.id, groupIds);
				return {
					result: 'alreadyPending' as const,
					request: existing,
					recipientUserId: recipient.id
				};
			}
			try {
				const [created] = await database
					.insert(friendRequests)
					.values({ senderUserId, recipientUserId: recipient.id })
					.returning({ id: friendRequests.id, createdAt: friendRequests.createdAt });
				if (groupIds.length)
					await database
						.insert(friendRequestGroups)
						.values(groupIds.map((groupId) => ({ requestId: created.id, groupId })));
				return {
					result: 'created' as const,
					request: {
						id: created.id,
						recipient: { userId: recipient.id, email: recipient.email, name: recipient.name },
						createdAt: created.createdAt
					},
					recipientUserId: recipient.id
				};
			} catch (cause) {
				if (!isUniqueViolation(cause)) throw cause;
				const request = await pendingOutgoing(senderUserId, recipient.id);
				if (!request) throw cause;
				await replaceRequestGroups(request.id, groupIds);
				return { result: 'alreadyPending' as const, request, recipientUserId: recipient.id };
			}
		},

		async accept(
			id: string,
			recipientUserId: string,
			addSenderToMyFriends: boolean,
			rawGroupIds: string[] = []
		) {
			const recipientGroupIds = addSenderToMyFriends
				? await ownedGroupIds(recipientUserId, rawGroupIds)
				: [];
			if (!addSenderToMyFriends && rawGroupIds.length)
				throw new FriendRequestError('INVALID_GROUPS');
			return database.transaction(async (tx) => {
				const [request] = await tx
					.update(friendRequests)
					.set({ status: 'accepted', updatedAt: new Date() })
					.where(
						and(
							eq(friendRequests.id, id),
							eq(friendRequests.recipientUserId, recipientUserId),
							eq(friendRequests.status, 'pending')
						)
					)
					.returning({ senderUserId: friendRequests.senderUserId });
				if (!request) {
					const [found] = await tx
						.select()
						.from(friendRequests)
						.where(eq(friendRequests.id, id))
						.limit(1);
					if (!found) throw new FriendRequestError('REQUEST_NOT_FOUND');
					if (found.recipientUserId !== recipientUserId) throw new FriendRequestError('FORBIDDEN');
					throw new FriendRequestError('REQUEST_NOT_PENDING');
				}
				const pairs = [{ ownerId: request.senderUserId, contactId: recipientUserId }];
				if (addSenderToMyFriends)
					pairs.push({ ownerId: recipientUserId, contactId: request.senderUserId });
				await tx.insert(contacts).values(pairs).onConflictDoNothing();
				const senderGroups = await tx
					.select({ groupId: friendRequestGroups.groupId })
					.from(friendRequestGroups)
					.where(eq(friendRequestGroups.requestId, id));
				const memberships = [
					...senderGroups.map(({ groupId }) => ({
						ownerId: request.senderUserId,
						groupId,
						userId: recipientUserId
					})),
					...recipientGroupIds.map((groupId) => ({
						ownerId: recipientUserId,
						groupId,
						userId: request.senderUserId
					}))
				];
				if (memberships.length)
					await tx.insert(contactGroupMembers).values(memberships).onConflictDoNothing();
				for (const pair of pairs)
					await tx
						.delete(removedContacts)
						.where(
							and(
								eq(removedContacts.ownerId, pair.ownerId),
								eq(removedContacts.userId, pair.contactId)
							)
						);
				return { id, status: 'accepted' as const, senderUserId: request.senderUserId };
			});
		},

		async reject(id: string, recipientUserId: string) {
			const [request] = await database
				.update(friendRequests)
				.set({ status: 'rejected', updatedAt: new Date() })
				.where(
					and(
						eq(friendRequests.id, id),
						eq(friendRequests.recipientUserId, recipientUserId),
						eq(friendRequests.status, 'pending')
					)
				)
				.returning({ senderUserId: friendRequests.senderUserId });
			if (!request) throw new FriendRequestError('REQUEST_NOT_PENDING');
			return { id, status: 'rejected' as const, senderUserId: request.senderUserId };
		},

		async cancel(id: string, senderUserId: string) {
			const [request] = await database
				.update(friendRequests)
				.set({ status: 'cancelled', updatedAt: new Date() })
				.where(
					and(
						eq(friendRequests.id, id),
						eq(friendRequests.senderUserId, senderUserId),
						eq(friendRequests.status, 'pending')
					)
				)
				.returning({ recipientUserId: friendRequests.recipientUserId });
			if (!request) throw new FriendRequestError('REQUEST_NOT_PENDING');
			return { id, status: 'cancelled' as const, recipientUserId: request.recipientUserId };
		}
	};
}

export const friendRequestService = createFriendRequestService();
