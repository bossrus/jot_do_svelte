import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db';
import {
	contactGroupMembers,
	contactGroups,
	contacts,
	todoWorkers,
	todos,
	users
} from '$lib/server/db/schema';
import { createTodoAccessService } from './access-service';

const ownerId = randomUUID();
const friendId = randomUUID();
const secondFriendId = randomUUID();
const strangerId = randomUUID();
const todoId = randomUUID();
const knownTodoId = randomUUID();
const groupId = randomUUID();
const service = createTodoAccessService(db, vi.fn());

describe.sequential('todo access service', () => {
	beforeAll(async () => {
		await db.insert(users).values(
			[ownerId, friendId, secondFriendId, strangerId].map((id, index) => ({
				id,
				publicId: `access-${id}`,
				email: `${id}@access.test`,
				displayName: `User ${index}`,
				plan: 'join' as const
			}))
		);
		await db.insert(contacts).values([
			{ ownerId, contactId: friendId },
			{ ownerId, contactId: secondFriendId }
		]);
		await db.insert(contactGroups).values({ id: groupId, ownerId, name: 'Team' });
		await db.insert(contactGroupMembers).values({ ownerId, groupId, userId: friendId });
		await db.insert(todos).values({ id: todoId, ownerId });
	});

	afterAll(async () => {
		await db.delete(users).where(eq(users.id, ownerId));
		await db.delete(users).where(eq(users.id, friendId));
		await db.delete(users).where(eq(users.id, secondFriendId));
		await db.delete(users).where(eq(users.id, strangerId));
	});

	it('sets a deduplicated full user list and rejects arbitrary users', async () => {
		expect(await service.set(ownerId, todoId, [friendId, friendId])).toEqual({
			todoId,
			userIds: [friendId],
			groupIds: []
		});
		await expect(service.set(ownerId, todoId, [friendId, strangerId])).rejects.toMatchObject({
			code: 'INVALID_PARTICIPANTS'
		});
		expect(
			(await service.list(ownerId, todoId)).directParticipants.map((item) => item.userId)
		).toEqual([friendId]);
	});

	it('keeps group and personal access as independent sources', async () => {
		await service.set(ownerId, todoId, [friendId], [groupId]);
		const access = await service.list(ownerId, todoId);
		expect(access.groupIds).toEqual([groupId]);
		expect(access.directParticipants.map((item) => item.userId)).toEqual([friendId]);
		expect(access.effectiveParticipants.map((item) => item.userId)).toEqual([friendId]);
		await service.set(ownerId, todoId, [friendId], []);
		expect(
			(await service.list(ownerId, todoId)).effectiveParticipants.map((item) => item.userId)
		).toEqual([friendId]);
		await service.set(ownerId, todoId, [], [groupId]);
		expect(
			(await service.list(ownerId, todoId)).effectiveParticipants.map((item) => item.userId)
		).toEqual([friendId]);
		await service.set(ownerId, todoId, [], []);
		expect((await service.list(ownerId, todoId)).effectiveParticipants).toEqual([]);
		await service.set(ownerId, todoId, [friendId], []);
	});

	it('preserves existing access after friendship removal while allowing another change', async () => {
		await db.insert(todos).values({ id: knownTodoId, ownerId });
		await service.set(ownerId, knownTodoId, [friendId]);
		await db
			.delete(contacts)
			.where(and(eq(contacts.ownerId, ownerId), eq(contacts.contactId, friendId)));
		expect(await service.set(ownerId, todoId, [friendId, secondFriendId])).toEqual({
			todoId,
			userIds: [friendId, secondFriendId],
			groupIds: []
		});
	});

	it('can grant access to a known participant but rejects an arbitrary user', async () => {
		await service.set(ownerId, todoId, [secondFriendId]);
		await expect(service.set(ownerId, todoId, [friendId, secondFriendId])).resolves.toMatchObject({
			userIds: [friendId, secondFriendId]
		});
		await expect(service.set(ownerId, todoId, [strangerId])).rejects.toMatchObject({
			code: 'INVALID_PARTICIPANTS'
		});
		await expect(service.set(strangerId, todoId, [])).rejects.toMatchObject({
			code: 'TODO_NOT_FOUND'
		});
	});

	it('lists workers as available participants and allows granting them direct access', async () => {
		await db.insert(todoWorkers).values([
			{ todoId, userId: strangerId },
			{ todoId, userId: ownerId }
		]);
		const access = await service.list(ownerId, todoId);
		expect(access.effectiveParticipants.map((item) => item.userId)).not.toContain(strangerId);
		expect(access.availableParticipants.map((item) => item.userId)).toContain(strangerId);
		expect(access.availableParticipants.map((item) => item.userId)).not.toContain(ownerId);
		await expect(service.set(ownerId, knownTodoId, [strangerId])).resolves.toMatchObject({
			userIds: [strangerId]
		});
	});
});
