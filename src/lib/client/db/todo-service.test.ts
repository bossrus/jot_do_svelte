import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TodoContentBlock } from '../content-blocks';
import { QuickTodoDatabase } from './database';
import { createTodoService, type NewTodoImage } from './todo-service';
import { createImageMarkupService } from '../markup/markup-service';
import type { PathMarkup } from '../markup/types';

const text = (id: string, value: string): TodoContentBlock => ({ id, type: 'text', text: value });
const imageBlock = (id: string, imageId: string): TodoContentBlock => ({
	id,
	type: 'image',
	imageId
});
const image = (id: string): NewTodoImage => ({
	id,
	blob: new Blob([id], { type: 'image/png' }),
	mimeType: 'image/png',
	width: 10,
	height: 20,
	sizeBytes: id.length
});
const markup = (id: string): PathMarkup => ({
	id,
	type: 'path',
	transform: { x: 0, y: 0, scale: 1, rotation: 0 },
	points: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.9, y: 0.9 }
	],
	bounds: { width: 0.8, height: 0.8 },
	color: '#e03131',
	width: 0.02
});

describe('todo block persistence', () => {
	let database: QuickTodoDatabase;
	let timestamp: number;
	beforeEach(() => {
		database = new QuickTodoDatabase(`quick-todo-test-${crypto.randomUUID()}`);
		timestamp = 100;
	});
	afterEach(async () => {
		await database.delete();
	});
	const service = () =>
		createTodoService(database, { now: () => timestamp++, createId: () => 'todo' });

	it('creates image-only content and preserves block order and empty inner lines', async () => {
		const blocks = [imageBlock('b1', 'img'), text('b2', ''), text('b3', 'after')];
		const created = await service().createTodo(blocks, [image('img')]);
		expect(created?.blocks).toEqual(blocks);
		await database.close();
		database = new QuickTodoDatabase(database.name);
		expect((await createTodoService(database).getActiveTodos())[0].blocks).toEqual(blocks);
	});

	it('immediately assigns the authenticated owner to a newly created todo', async () => {
		const ownerId = '40000000-0000-4000-8000-000000000001';
		const created = await service().createTodo([text('t', 'owned')], [], ownerId);
		expect(created?.ownerId).toBe(ownerId);
		expect((await database.todos.get('todo'))?.ownerId).toBe(ownerId);
	});

	it('atomically creates draft images with their stable-id markup', async () => {
		const first = { ...image('first'), markup: [markup('line-1')] };
		const second = { ...image('second'), markup: [markup('line-2')] };
		const plain = image('plain');
		await service().createTodo(
			[
				text('t', 'new'),
				imageBlock('b1', first.id),
				imageBlock('b2', second.id),
				imageBlock('b3', plain.id)
			],
			[first, second, plain]
		);

		expect((await database.todoImages.get('first'))?.id).toBe('first');
		expect(await database.imageMarkups.get('first')).toMatchObject({
			imageId: 'first',
			objects: [markup('line-1')]
		});
		expect(await database.imageMarkups.get('second')).toMatchObject({
			imageId: 'second',
			objects: [markup('line-2')]
		});
		expect(await database.imageMarkups.get('plain')).toBeUndefined();
	});

	it('atomically replaces blocks, image order and removed blobs on edit', async () => {
		const todos = service();
		await todos.createTodo([text('t', 'before'), imageBlock('old-b', 'old')], [image('old')]);
		const next = [imageBlock('new-b', 'new'), text('t2', 'after')];
		const updated = await todos.updateTodo('todo', next, [image('new')]);
		expect(updated?.blocks).toEqual(next);
		expect(await database.todoImages.get('old')).toBeUndefined();
	});

	it('deletes markup with a removed image and keeps markup for retained images', async () => {
		const todos = service();
		await todos.createTodo(
			[imageBlock('a', 'keep'), imageBlock('b', 'remove')],
			[image('keep'), image('remove')]
		);
		await database.imageMarkups.bulkAdd([
			{ imageId: 'keep', objects: [], version: 1, updatedAt: 1 },
			{ imageId: 'remove', objects: [], version: 1, updatedAt: 1 }
		]);
		await todos.updateTodo('todo', [imageBlock('a', 'keep')], [image('keep')]);
		expect(await database.imageMarkups.get('keep')).toBeDefined();
		expect(await database.imageMarkups.get('remove')).toBeUndefined();
	});

	it('migrates v2 text and ordered image blobs into v3 blocks', async () => {
		const name = database.name;
		await database.delete();
		const legacy = new Dexie(name);
		legacy.version(1).stores({ todos: 'id, status, createdAt, updatedAt, deletedAt' });
		legacy.version(2).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, [todoId+sortOrder], createdAt'
		});
		await legacy.table('todos').add({
			id: 'legacy',
			text: 'line 1\nline 2',
			status: 'active',
			createdAt: 1,
			updatedAt: 1,
			closedAt: null,
			deletedAt: null
		});
		await legacy.table('todoImages').bulkAdd([
			{ ...image('second'), todoId: 'legacy', sortOrder: 1, createdAt: 1 },
			{ ...image('first'), todoId: 'legacy', sortOrder: 0, createdAt: 1 }
		]);
		legacy.close();
		database = new QuickTodoDatabase(name);
		const migrated = (await createTodoService(database).getActiveTodos())[0];
		expect(
			migrated.blocks.map((block) => (block.type === 'text' ? block.text : block.imageId))
		).toEqual(['line 1', 'line 2', 'first', 'second']);
		expect(migrated.images).toHaveLength(2);
		expect(migrated).toMatchObject({
			serverRevision: null,
			localVersion: 1,
			isDirty: true,
			isPendingDelete: false,
			hasSyncConflict: false
		});
	});

	it('migrates v4 todos without changing blocks, blobs or markup', async () => {
		const name = database.name;
		await database.delete();
		const legacy = new Dexie(name);
		legacy.version(4).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, createdAt',
			todoBlocks: 'id, todoId, [todoId+position], type, imageId',
			imageMarkups: 'imageId, updatedAt'
		});
		await legacy.table('todos').add({
			id: 'legacy',
			status: 'active',
			createdAt: 1,
			updatedAt: 1,
			closedAt: null,
			deletedAt: null
		});
		await legacy.table('todoImages').add({ ...image('img'), todoId: 'legacy', createdAt: 1 });
		await legacy.table('todoBlocks').add({
			id: 'block',
			todoId: 'legacy',
			type: 'image',
			position: 0,
			text: null,
			imageId: 'img'
		});
		await legacy
			.table('imageMarkups')
			.add({ imageId: 'img', objects: [], version: 1, updatedAt: 1 });
		legacy.close();
		database = new QuickTodoDatabase(name);
		const migrated = (await createTodoService(database).getActiveTodos())[0];
		expect(migrated).toMatchObject({
			serverRevision: null,
			localVersion: 1,
			isDirty: true,
			isPendingDelete: false,
			hasSyncConflict: false
		});
		expect(await migrated.images[0].blob.text()).toBe('img');
		expect(migrated.images[0].storageKey).toBeNull();
		expect(migrated.blocks).toEqual([imageBlock('block', 'img')]);
		expect(await database.imageMarkups.get('img')).toMatchObject({ imageId: 'img', objects: [] });
	});

	it('increments localVersion for content, close and reopen without changing serverRevision', async () => {
		const todos = service();
		const created = await todos.createTodo([text('t', 'one')]);
		expect(created).toMatchObject({ serverRevision: null, localVersion: 1, isDirty: true });
		await database.todos.update('todo', { serverRevision: 5, isDirty: false });
		const edited = await todos.updateTodo('todo', [text('t', 'two')], []);
		expect(edited).toMatchObject({ serverRevision: 5, localVersion: 2, isDirty: true });
		const closed = await todos.closeTodo('todo');
		expect(closed).toMatchObject({ serverRevision: 5, localVersion: 3, isDirty: true });
		const reopened = await todos.reopenTodo('todo');
		expect(reopened).toMatchObject({ serverRevision: 5, localVersion: 4, isDirty: true });
	});

	it('marks image replacement and saved markup as todo mutations', async () => {
		const todos = service();
		await todos.createTodo([imageBlock('b', 'one')], [image('one')]);
		await todos.updateTodo('todo', [imageBlock('b2', 'two')], [image('two')]);
		expect(await database.todos.get('todo')).toMatchObject({ localVersion: 2, isDirty: true });
		await createImageMarkupService(database).save('two', []);
		expect(await database.todos.get('todo')).toMatchObject({ localVersion: 3, isDirty: true });
	});

	it('physically deletes an unsynced todo and all related entities', async () => {
		const todos = service();
		await todos.createTodo([imageBlock('b', 'img')], [image('img')]);
		await createImageMarkupService(database).save('img', []);
		await todos.closeTodo('todo');
		await todos.deleteTodo('todo');
		expect(await database.todos.get('todo')).toBeUndefined();
		expect(await database.todoBlocks.count()).toBe(0);
		expect(await database.todoImages.count()).toBe(0);
		expect(await database.imageMarkups.count()).toBe(0);
	});

	it('keeps a synced delete as a hidden pending tombstone and can finalize it', async () => {
		const todos = service();
		await todos.createTodo([text('t', 'one')]);
		await todos.closeTodo('todo');
		await database.todos.update('todo', { serverRevision: 5, isDirty: false });
		const removed = await todos.deleteTodo('todo');
		expect(removed).toMatchObject({
			serverRevision: 5,
			localVersion: 3,
			isDirty: true,
			isPendingDelete: true
		});
		expect(await todos.getClosedTodos()).toEqual([]);
		expect(await todos.getPendingDeletes()).toHaveLength(1);
		await todos.finalizeSyncedDelete('todo');
		expect(await database.todos.get('todo')).toBeUndefined();
	});

	it('marks synced only when no newer local mutation exists', async () => {
		const todos = service();
		await todos.createTodo([text('t', 'one')]);
		await database.todos.update('todo', { serverRevision: 5 });
		const synced = await todos.markTodoSynced({
			todoId: 'todo',
			serverRevision: 6,
			sentLocalVersion: 1
		});
		expect(synced).toMatchObject({ serverRevision: 6, localVersion: 1, isDirty: false });
		await todos.updateTodo('todo', [text('t', 'two')], []);
		const raced = await todos.markTodoSynced({
			todoId: 'todo',
			serverRevision: 7,
			sentLocalVersion: 1
		});
		expect(raced).toMatchObject({ serverRevision: 7, localVersion: 2, isDirty: true });
	});

	it('sets and clears conflict independently of content', async () => {
		const todos = service();
		await todos.createTodo([text('t', 'one')]);
		await todos.markSyncConflict('todo');
		expect(await todos.getConflictedTodos()).toHaveLength(1);
		await todos.clearSyncConflict('todo');
		expect((await database.todos.get('todo'))?.hasSyncConflict).toBe(false);
	});

	it('removes only inaccessible foreign todos and all local child records', async () => {
		const todos = service();
		await todos.createTodo(
			[imageBlock('todo-block', 'todo-image')],
			[image('todo-image')],
			'owner'
		);
		await database.todos.update('todo', { ownerId: 'other', isDirty: false, serverRevision: 1 });
		await database.imageMarkups.put({
			imageId: 'todo-image',
			version: 1,
			objects: [],
			updatedAt: 1
		});
		await database.messages.put({
			id: 'message',
			todoId: 'todo',
			authorId: null,
			authorName: 'x',
			type: 'user',
			eventType: null,
			createdAt: 1,
			updatedAt: 1,
			serverRevision: 1,
			localVersion: 1,
			isDirty: false
		});
		await database.messageImages.put({
			id: 'message-image',
			messageId: 'message',
			blob: new Blob(['x']),
			mimeType: 'image/png',
			width: 1,
			height: 1,
			sizeBytes: 1,
			createdAt: 1,
			storageKey: null
		});
		await database.messageBlocks.put({
			id: 'message-block',
			messageId: 'message',
			type: 'image',
			position: 0,
			text: null,
			imageId: 'message-image'
		});
		await database.imageMarkups.put({
			imageId: 'message-image',
			version: 1,
			objects: [],
			updatedAt: 1
		});
		await database.dialogReadStates.put({
			todoId: 'todo',
			readUserMessagesCount: 0,
			unreadCount: 1,
			updatedAt: 1
		});
		await database.todoWorkers.put({
			id: 'todo:worker',
			todoId: 'todo',
			userId: 'worker',
			name: 'Worker',
			state: 'doing',
			startedAt: 1,
			finishedAt: null
		});

		expect(await todos.removeInaccessibleSharedTodos('current', [])).toBe(1);
		expect(
			await Promise.all([
				database.todos.count(),
				database.todoBlocks.count(),
				database.todoImages.count(),
				database.imageMarkups.count(),
				database.messages.count(),
				database.messageBlocks.count(),
				database.messageImages.count(),
				database.dialogReadStates.count(),
				database.todoWorkers.count()
			])
		).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
	});

	it('keeps owned and server-accessible foreign todos during authoritative cleanup', async () => {
		const todos = service();
		await todos.createTodo([text('owned-block', 'owned')], [], 'current');
		await database.todos.put({
			...(await database.todos.get('todo'))!,
			id: 'shared',
			ownerId: 'other'
		});
		expect(await todos.removeInaccessibleSharedTodos('current', ['shared'])).toBe(0);
		expect((await database.todos.toArray()).map((todo) => todo.id).sort()).toEqual([
			'shared',
			'todo'
		]);
	});
});
