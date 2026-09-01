import { and, desc, eq, isNull, notExists, sql } from 'drizzle-orm';
import { db as defaultDb } from '$lib/server/db';
import { contacts, removedContacts, users } from '$lib/server/db/schema';

type Database = typeof defaultDb;
export type FriendErrorCode = 'USER_NOT_FOUND' | 'CANNOT_ADD_SELF';

export class FriendError extends Error {
	constructor(readonly code: FriendErrorCode) {
		super(code);
	}
}

const publicFriend = {
	userId: users.id,
	email: users.email,
	name: users.displayName,
	plan: users.plan,
	createdAt: contacts.createdAt
};

export function createFriendService(database: Database = defaultDb) {
	return {
		async list(ownerId: string) {
			const friends = await database
				.select(publicFriend)
				.from(contacts)
				.innerJoin(users, eq(users.id, contacts.contactId))
				.where(and(eq(contacts.ownerId, ownerId), isNull(users.deletedAt)))
				.orderBy(desc(contacts.createdAt));
			return { friends };
		},

		async listFormer(ownerId: string) {
			const formerFriends = await database
				.select({
					userId: users.id,
					email: users.email,
					name: users.displayName,
					removedAt: removedContacts.removedAt,
					reason: removedContacts.reason
				})
				.from(removedContacts)
				.innerJoin(users, eq(users.id, removedContacts.userId))
				.where(
					and(
						eq(removedContacts.ownerId, ownerId),
						isNull(users.deletedAt),
						notExists(
							database
								.select({ value: sql`1` })
								.from(contacts)
								.where(
									and(
										eq(contacts.ownerId, removedContacts.ownerId),
										eq(contacts.contactId, removedContacts.userId)
									)
								)
						)
					)
				)
				.orderBy(desc(removedContacts.removedAt));
			return { formerFriends };
		},

		async add(ownerId: string, rawEmail: string) {
			const email = rawEmail.trim().toLowerCase();
			const [candidate] = await database
				.select({ id: users.id, email: users.email, name: users.displayName, plan: users.plan })
				.from(users)
				.where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
				.limit(1);
			if (!candidate) throw new FriendError('USER_NOT_FOUND');
			if (candidate.id === ownerId) throw new FriendError('CANNOT_ADD_SELF');

			return database.transaction(async (tx) => {
				await tx
					.delete(removedContacts)
					.where(
						and(eq(removedContacts.ownerId, ownerId), eq(removedContacts.userId, candidate.id))
					);
				const inserted = await tx
					.insert(contacts)
					.values({ ownerId, contactId: candidate.id })
					.onConflictDoNothing()
					.returning({ createdAt: contacts.createdAt });
				const createdAt =
					inserted[0]?.createdAt ??
					(
						await tx
							.select({ createdAt: contacts.createdAt })
							.from(contacts)
							.where(and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, candidate.id)))
							.limit(1)
					)[0].createdAt;
				return {
					friend: {
						userId: candidate.id,
						email: candidate.email,
						name: candidate.name,
						plan: candidate.plan,
						createdAt
					},
					created: inserted.length > 0
				};
			});
		},

		async remove(ownerId: string, userId: string, reason?: string) {
			return database.transaction(async (tx) => {
				const deleted = await tx
					.delete(contacts)
					.where(and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, userId)))
					.returning({ userId: contacts.contactId });
				if (deleted.length) {
					await tx
						.insert(removedContacts)
						.values({ ownerId, userId, reason: reason?.trim() || null })
						.onConflictDoUpdate({
							target: [removedContacts.ownerId, removedContacts.userId],
							set: { reason: reason?.trim() || null, removedAt: new Date() }
						});
				}
				return { userId, removed: deleted.length > 0 };
			});
		}
	};
}

export const friendService = createFriendService();
