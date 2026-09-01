import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db';
import {
	contacts,
	messages,
	todoAccessRevocations,
	todoUserAccess,
	todos,
	users
} from '$lib/server/db/schema';
import { createTodoAccessService } from '$lib/server/todos/access-service';
import { SyncError } from './errors';
import { createTodoSyncService } from './todo-sync-service';

const ownerId = randomUUID();
const otherUserId = randomUUID();
const todoId = randomUUID();
const imageId = randomUUID();
const publish = vi.fn();
const service = createTodoSyncService(db, publish);
const accessService = createTodoAccessService(db, publish);

function input(baseRevision: number, text = 'first') {
	return {
		id: todoId,
		baseRevision,
		status: 'active' as const,
		blocks: [
			{ id: randomUUID(), type: 'text' as const, position: 0, text },
			{ id: randomUUID(), type: 'image' as const, position: 1, imageId }
		],
		images: [
			{
				id: imageId,
				storageKey: `users/${ownerId}/images/${imageId}.png`,
				mimeType: 'image/png' as const,
				width: 20,
				height: 10,
				sizeBytes: 200,
				markup: { version: 1 as const, objects: [] }
			}
		]
	};
}

describe.sequential('todo sync service integration', () => {
	beforeAll(async () => {
		await db.insert(users).values([
			{
				id: ownerId,
				publicId: `test-${ownerId}`,
				email: `${ownerId}@test.invalid`,
				displayName: 'Owner',
				plan: 'join'
			},
			{
				id: otherUserId,
				publicId: `test-${otherUserId}`,
				email: `${otherUserId}@test.invalid`,
				displayName: 'Other',
				plan: 'join'
			}
		]);
		await db.insert(contacts).values({ ownerId, contactId: otherUserId });
	});

	afterAll(async () => {
		await db.delete(users).where(eq(users.id, ownerId));
		await db.delete(users).where(eq(users.id, otherUserId));
	});

	it('creates revision 1 with session owner and complete structured content', async () => {
		expect(await service.put(ownerId, todoId, input(0))).toEqual({ revision: 1, created: true });
		const todo = await service.get(ownerId, todoId);
		expect(todo.revision).toBe(1);
		expect(todo.blocks).toHaveLength(2);
		expect(todo.images[0]).toMatchObject({
			id: imageId,
			storageKey: `users/${ownerId}/images/${imageId}.png`,
			markup: { version: 1, objects: [] }
		});
		expect(publish).toHaveBeenLastCalledWith(ownerId, {
			type: 'todo.changed',
			todoId,
			revision: 1
		});
	});

	it('hides the todo from another owner', async () => {
		await expect(service.get(otherUserId, todoId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('grants idempotent read-only access and routes updates to the participant', async () => {
		expect(await accessService.set(ownerId, todoId, [otherUserId])).toMatchObject({
			userIds: [otherUserId]
		});
		expect(await accessService.set(ownerId, todoId, [otherUserId, otherUserId])).toMatchObject({
			userIds: [otherUserId]
		});
		expect(
			await db.select().from(todoUserAccess).where(eq(todoUserAccess.todoId, todoId))
		).toHaveLength(1);
		expect((await service.get(otherUserId, todoId)).ownerId).toBe(ownerId);
		expect((await service.list(otherUserId)).todos.map((todo) => todo.id)).toContain(todoId);
		await expect(service.put(otherUserId, todoId, input(1, 'forbidden'))).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		await service.put(ownerId, todoId, input(1, 'shared update'));
		expect(publish).toHaveBeenCalledWith(otherUserId, {
			type: 'todo.changed',
			todoId,
			revision: 2
		});
	});

	it('atomically replaces content and increments revision', async () => {
		const update = input(2, 'updated');
		expect(await service.put(ownerId, todoId, update)).toEqual({
			revision: 3,
			created: false
		});
		const todo = await service.get(ownerId, todoId);
		expect(todo.revision).toBe(3);
		expect(todo.blocks[0]).toMatchObject({ type: 'text', text: 'updated' });
		const systemRows = await db.select().from(messages).where(eq(messages.todoId, todoId));
		const systemEvents = systemRows
			.filter((message) => message.type === 'system')
			.map((message) => message.eventType);
		expect(systemEvents).toHaveLength(3);
		expect(systemEvents.filter((event) => event === 'Owner изменил доступ к задаче')).toHaveLength(
			1
		);
		expect(systemEvents.filter((event) => event === 'Owner изменил задачу')).toHaveLength(2);
		const publishCount = publish.mock.calls.length;
		expect(await service.put(ownerId, todoId, update)).toEqual({ revision: 3, created: false });
		expect((await service.get(ownerId, todoId)).revision).toBe(3);
		expect(await db.select().from(messages).where(eq(messages.todoId, todoId))).toHaveLength(
			systemRows.length
		);
		expect(publish).toHaveBeenCalledTimes(publishCount);
	});

	it('freezes shared data after a Join to Cloud downgrade without disabling owned sync', async () => {
		const ownedByOtherId = randomUUID();
		await db.insert(todos).values({ id: ownedByOtherId, ownerId: otherUserId });
		await db.update(users).set({ plan: 'cloud' }).where(eq(users.id, otherUserId));
		const index = await service.list(otherUserId);
		expect(index.todos.map((todo) => todo.id)).toContain(ownedByOtherId);
		expect(index.todos.map((todo) => todo.id)).not.toContain(todoId);
		expect(index.revokedTodoIds).not.toContain(todoId);
		await expect(service.get(otherUserId, todoId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
		await db.update(users).set({ plan: 'join' }).where(eq(users.id, otherUserId));
		expect((await service.list(otherUserId)).todos.map((todo) => todo.id)).toContain(todoId);
		await db.delete(todos).where(eq(todos.id, ownedByOtherId));
	});

	it('creates one system message for close and one for reopen', async () => {
		await service.put(ownerId, todoId, { ...input(3, 'updated'), status: 'closed' });
		await service.put(ownerId, todoId, input(4, 'updated'));
		const systemRows = await db.select().from(messages).where(eq(messages.todoId, todoId));
		const systemEvents = systemRows
			.filter((message) => message.type === 'system')
			.map((message) => message.eventType);
		expect(systemEvents.filter((event) => event === 'Owner закрыл задачу')).toHaveLength(1);
		expect(systemEvents.filter((event) => event === 'Owner снова открыл задачу')).toHaveLength(1);
	});

	it('rejects stale updates without state changes or events', async () => {
		publish.mockClear();
		await expect(service.put(ownerId, todoId, input(1, 'stale'))).rejects.toEqual(
			new SyncError('REVISION_CONFLICT', 5)
		);
		expect((await service.get(ownerId, todoId)).blocks[0]).toMatchObject({ text: 'updated' });
		expect(publish).not.toHaveBeenCalled();
	});

	it('revokes only participant visibility and emits a per-user revocation', async () => {
		expect(await accessService.set(ownerId, todoId, [])).toMatchObject({ userIds: [] });
		await expect(service.get(otherUserId, todoId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect((await service.get(ownerId, todoId)).id).toBe(todoId);
		expect((await service.list(otherUserId)).revokedTodoIds).toContain(todoId);
		expect(
			await db.select().from(todoAccessRevocations).where(eq(todoAccessRevocations.todoId, todoId))
		).toHaveLength(1);
		expect(publish).toHaveBeenCalledWith(otherUserId, {
			type: 'todo.access-revoked',
			todoId
		});
	});

	it('restores access after revoke and never returns the stale revocation again', async () => {
		expect(await accessService.set(ownerId, todoId, [otherUserId])).toMatchObject({
			userIds: [otherUserId]
		});
		for (let pull = 0; pull < 2; pull++) {
			const index = await service.list(otherUserId);
			expect(index.todos.map((todo) => todo.id)).toContain(todoId);
			expect(index.revokedTodoIds).not.toContain(todoId);
		}
		expect(
			await db.select().from(todoAccessRevocations).where(eq(todoAccessRevocations.todoId, todoId))
		).toHaveLength(0);
	});

	it('uses access at sync time as truth when revoke and regrant happen while offline', async () => {
		expect(await accessService.set(ownerId, todoId, [])).toMatchObject({ userIds: [] });
		expect(await accessService.set(ownerId, todoId, [otherUserId])).toMatchObject({
			userIds: [otherUserId]
		});
		const index = await service.list(otherUserId);
		expect(index.todos.map((todo) => todo.id)).toContain(todoId);
		expect(index.revokedTodoIds).toEqual([]);
	});

	it('keeps repeated revoke/grant cycles idempotent and mutually exclusive', async () => {
		for (let cycle = 0; cycle < 2; cycle++) {
			expect(await accessService.set(ownerId, todoId, [])).toMatchObject({ userIds: [] });
			expect(await accessService.set(ownerId, todoId, [])).toMatchObject({ userIds: [] });
			expect(await accessService.set(ownerId, todoId, [otherUserId])).toMatchObject({
				userIds: [otherUserId]
			});
			expect(await accessService.set(ownerId, todoId, [otherUserId])).toMatchObject({
				userIds: [otherUserId]
			});
		}
		expect(
			await db.select().from(todoUserAccess).where(eq(todoUserAccess.todoId, todoId))
		).toHaveLength(1);
		expect(
			await db.select().from(todoAccessRevocations).where(eq(todoAccessRevocations.todoId, todoId))
		).toHaveLength(0);
	});

	it('physically deleting a todo cascades access and revocation records', async () => {
		const disposableTodoId = randomUUID();
		await db.insert(todos).values({ id: disposableTodoId, ownerId });
		await db.insert(todoUserAccess).values({
			todoId: disposableTodoId,
			userId: otherUserId,
			grantedBy: ownerId
		});
		await db.insert(todoAccessRevocations).values({
			todoId: disposableTodoId,
			userId: ownerId
		});
		await db.delete(todos).where(eq(todos.id, disposableTodoId));
		expect(
			await db.select().from(todoUserAccess).where(eq(todoUserAccess.todoId, disposableTodoId))
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(todoAccessRevocations)
				.where(eq(todoAccessRevocations.todoId, disposableTodoId))
		).toHaveLength(0);
	});

	it('creates a tombstone that remains in the index', async () => {
		const deleted = await service.delete(ownerId, todoId, 5);
		expect(deleted.revision).toBe(6);
		expect((await service.list(ownerId)).todos.find((todo) => todo.id === todoId)).toMatchObject({
			revision: 6
		});
		expect((await service.get(ownerId, todoId)).deletedAt).toBeInstanceOf(Date);
		expect(publish).toHaveBeenCalledWith(ownerId, {
			type: 'todo.deleted',
			todoId,
			revision: 6
		});
		expect(publish).toHaveBeenCalledWith(otherUserId, {
			type: 'todo.deleted',
			todoId,
			revision: 6
		});
	});
});
