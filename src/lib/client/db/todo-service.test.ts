import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuickTodoDatabase } from './database';
import { createTodoService } from './todo-service';

function image(id: string, contents = id) {
	return {
		id,
		blob: new Blob([contents], { type: 'image/png' }),
		mimeType: 'image/png',
		width: 20,
		height: 10,
		sizeBytes: contents.length
	};
}

describe('todo service', () => {
	let database: QuickTodoDatabase;
	let timestamp: number;
	let nextId: number;

	beforeEach(() => {
		database = new QuickTodoDatabase(`quick-todo-test-${crypto.randomUUID()}`);
		timestamp = 1_700_000_000_000;
		nextId = 1;
	});

	afterEach(async () => {
		await database.delete();
	});

	function service() {
		return createTodoService(database, {
			now: () => timestamp++,
			createId: () => `todo-${nextId++}`
		});
	}

	it('does not create an empty or whitespace-only todo', async () => {
		const todos = service();

		expect(await todos.createTodo('')).toBeNull();
		expect(await todos.createTodo('   \n\t  ')).toBeNull();
		expect(await database.todos.count()).toBe(0);
	});

	it('creates a todo and normalizes surrounding whitespace', async () => {
		const todos = service();
		const created = await todos.createTodo('   купить молоко   ');

		expect(created).toMatchObject({
			id: 'todo-1',
			text: 'купить молоко',
			status: 'active',
			closedAt: null,
			deletedAt: null
		});
		expect(await todos.getActiveTodos()).toEqual([created]);
	});

	it('creates image-only and text-with-images todos and preserves image order', async () => {
		const todos = service();
		const imageOnly = await todos.createTodo('  ', [image('first'), image('second')]);
		expect(imageOnly?.text).toBe('');
		expect(imageOnly?.images.map(({ id, sortOrder }) => ({ id, sortOrder }))).toEqual([
			{ id: 'first', sortOrder: 0 },
			{ id: 'second', sortOrder: 1 }
		]);

		const mixed = await todos.createTodo('  Комментарий  ', [image('third')]);
		expect(mixed).toMatchObject({ text: 'Комментарий', images: [{ id: 'third' }] });
		expect(await database.todoImages.count()).toBe(3);
	});

	it('updates attachment order and deletes removed image blobs atomically', async () => {
		const todos = service();
		const created = await todos.createTodo('Фото', [image('old'), image('keep')]);
		if (!created) throw new Error('Expected a todo');

		const updated = await todos.updateTodo(created.id, '', [image('keep'), image('new')]);
		expect(updated?.images.map((item) => [item.id, item.sortOrder])).toEqual([
			['keep', 0],
			['new', 1]
		]);
		expect(await database.todoImages.get('old')).toBeUndefined();
	});

	it('deletes one existing image without affecting its siblings', async () => {
		const todos = service();
		const created = await todos.createTodo('', [image('one'), image('two')]);
		if (!created) throw new Error('Expected a todo');
		await todos.deleteTodoImage(created.id, 'one');
		expect(
			(await database.todoImages.where('todoId').equals(created.id).toArray()).map(
				(item) => item.id
			)
		).toEqual(['two']);
	});

	it('keeps images when a todo is closed and reopened', async () => {
		const todos = service();
		const created = await todos.createTodo('Фото', [image('photo')]);
		if (!created) throw new Error('Expected a todo');
		await todos.closeTodo(created.id);
		expect((await todos.getClosedTodos())[0].images).toHaveLength(1);
		await todos.reopenTodo(created.id);
		expect((await todos.getActiveTodos())[0].images[0].id).toBe('photo');
	});

	it('closes and reopens the same todo', async () => {
		const todos = service();
		const created = await todos.createTodo('Задача');
		if (!created) throw new Error('Expected a todo');

		const closed = await todos.closeTodo(created.id);
		expect(closed.status).toBe('closed');
		expect(closed.closedAt).not.toBeNull();
		expect(await todos.getActiveTodos()).toEqual([]);

		const reopened = await todos.reopenTodo(created.id);
		expect(reopened.status).toBe('active');
		expect(reopened.closedAt).toBeNull();
		expect(await todos.getActiveTodos()).toHaveLength(1);
	});

	it('saves normalized edited text and rejects an empty edit', async () => {
		const todos = service();
		const created = await todos.createTodo('Старый текст');
		if (!created) throw new Error('Expected a todo');

		const updated = await todos.updateTodo(created.id, '  Новый текст  ');
		expect(updated?.text).toBe('Новый текст');
		expect(await todos.updateTodo(created.id, '   ')).toBeNull();
		expect((await database.todos.get(created.id))?.text).toBe('Новый текст');
	});

	it('soft-deletes a closed todo and excludes it from queries', async () => {
		const todos = service();
		const created = await todos.createTodo('Удалить');
		if (!created) throw new Error('Expected a todo');

		await todos.closeTodo(created.id);
		const deleted = await todos.deleteTodo(created.id);

		expect(deleted.deletedAt).not.toBeNull();
		expect(await todos.getClosedTodos()).toEqual([]);
		expect((await database.todos.get(created.id))?.deletedAt).not.toBeNull();
	});

	it('keeps todos after the database is closed and reopened', async () => {
		const databaseName = database.name;
		const todos = service();
		await todos.createTodo('Пережить reload');
		await database.close();

		database = new QuickTodoDatabase(databaseName);
		const reopenedService = createTodoService(database);

		expect(await reopenedService.getActiveTodos()).toMatchObject([
			{ text: 'Пережить reload', status: 'active' }
		]);
	});

	it('migrates a version 1 database without losing existing todos', async () => {
		const databaseName = database.name;
		await database.delete();
		const legacy = new Dexie(databaseName);
		legacy.version(1).stores({ todos: 'id, status, createdAt, updatedAt, deletedAt' });
		await legacy.table('todos').add({
			id: 'legacy',
			text: 'Старая задача',
			status: 'active',
			createdAt: 1,
			updatedAt: 1,
			closedAt: null,
			deletedAt: null
		});
		legacy.close();

		database = new QuickTodoDatabase(databaseName);
		const migrated = createTodoService(database);
		expect(await migrated.getActiveTodos()).toMatchObject([
			{ id: 'legacy', text: 'Старая задача', images: [] }
		]);
		expect(await database.todoImages.count()).toBe(0);
	});
});
