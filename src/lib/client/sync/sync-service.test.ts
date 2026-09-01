import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TodoContentBlock } from '../content-blocks';
import { isTodoOwner, QuickTodoDatabase } from '../db/database';
import { createTodoService, type NewTodoImage } from '../db/todo-service';
import { createSyncService } from './sync-service';

const TODO_ID = '10000000-0000-4000-8000-000000000001';
const BLOCK_ID = '20000000-0000-4000-8000-000000000001';
const IMAGE_ID = '30000000-0000-4000-8000-000000000001';
const OWNER_ID = '40000000-0000-4000-8000-000000000001';
const text = (value: string): TodoContentBlock => ({ id: BLOCK_ID, type: 'text', text: value });
const imageBlock: TodoContentBlock = { id: BLOCK_ID, type: 'image', imageId: IMAGE_ID };
const image: NewTodoImage = {
	id: IMAGE_ID,
	blob: new Blob(['image'], { type: 'image/png' }),
	mimeType: 'image/png',
	width: 10,
	height: 10,
	sizeBytes: 5
};
const date = '2026-01-01T00:00:00.000Z';
const indexItem = (revision: number, deletedAt: string | null = null) => ({
	id: TODO_ID,
	revision,
	status: 'active',
	createdAt: date,
	updatedAt: date,
	deletedAt
});
const fullTodo = (revision: number, value = 'server') => ({
	...indexItem(revision),
	closedAt: null,
	blocks: [{ id: BLOCK_ID, type: 'text', position: 0, text: value }],
	images: []
});
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('client todo sync engine', () => {
	let database: QuickTodoDatabase;
	let repository: ReturnType<typeof createTodoService>;
	let timestamp: number;

	beforeEach(() => {
		database = new QuickTodoDatabase(`sync-test-${crypto.randomUUID()}`);
		timestamp = 100;
		repository = createTodoService(database, {
			now: () => timestamp++,
			createId: () => TODO_ID
		});
	});

	afterEach(async () => {
		await database.delete();
	});

	function engine(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
		const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
			handler(String(input), init ?? {})
		);
		const fetch = fetchMock as unknown as typeof globalThis.fetch;
		return {
			sync: createSyncService({ repository, fetch, hasAuthenticatedSession: async () => true }),
			fetch: fetchMock
		};
	}

	it('uploads a new text todo and stores revision 1', async () => {
		await repository.createTodo([text('local')]);
		const bodies: unknown[] = [];
		const { sync } = engine((url, init) => {
			if (init.method === 'PUT') {
				bodies.push(JSON.parse(String(init.body)));
				return json({ revision: 1, created: true }, 201);
			}
			if (url === '/api/sync/todos') return json([indexItem(1)]);
			throw new Error('Unexpected request');
		});
		const result = await sync.syncNow();
		expect(result).toMatchObject({ status: 'success', created: 1, conflicts: 0 });
		expect(bodies[0]).toMatchObject({ id: TODO_ID, baseRevision: 0, images: [] });
		expect(await database.todos.get(TODO_ID)).toMatchObject({ serverRevision: 1, isDirty: false });
	});

	it('fills ownerId from the sync index when the local revision is already current', async () => {
		await repository.createTodo([text('local')]);
		await database.todos.update(TODO_ID, {
			ownerId: null,
			serverRevision: 1,
			isDirty: false
		});
		const beforeSync = await database.todos.get(TODO_ID);
		expect(beforeSync?.ownerId).toBeNull();
		expect(isTodoOwner(beforeSync!, OWNER_ID)).toBe(false);
		const { sync, fetch } = engine((url) => {
			if (url === '/api/sync/todos') return json([{ ...indexItem(1), ownerId: OWNER_ID }]);
			throw new Error('The full todo must not be fetched for metadata-only reconciliation');
		});

		expect(await sync.syncNow()).toMatchObject({ status: 'success', pulled: 0 });
		const afterSync = await database.todos.get(TODO_ID);
		expect(afterSync).toMatchObject({ ownerId: OWNER_ID });
		expect(isTodoOwner(afterSync!, OWNER_ID)).toBe(true);
		expect(isTodoOwner(afterSync!, '50000000-0000-4000-8000-000000000001')).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('updates at the known revision and advances it', async () => {
		await repository.createTodo([text('local')]);
		await database.todos.update(TODO_ID, { serverRevision: 3 });
		const { sync } = engine((url, init) => {
			if (init.method === 'PUT') {
				expect(JSON.parse(String(init.body))).toMatchObject({ baseRevision: 3 });
				return json({ revision: 4, created: false });
			}
			if (url === '/api/sync/todos') return json([indexItem(4)]);
			throw new Error('Unexpected request');
		});
		expect(await sync.syncNow()).toMatchObject({ updated: 1 });
		expect(await database.todos.get(TODO_ID)).toMatchObject({ serverRevision: 4, isDirty: false });
	});

	it('keeps a mutation made during PUT dirty while accepting the server revision', async () => {
		await repository.createTodo([text('one')]);
		await database.todos.update(TODO_ID, { serverRevision: 3, localVersion: 5 });
		const { sync } = engine(async (url, init) => {
			if (init.method === 'PUT') {
				await repository.updateTodo(TODO_ID, [text('two')], []);
				return json({ revision: 4, created: false });
			}
			if (url === '/api/sync/todos') return json([indexItem(4)]);
			throw new Error('Unexpected request');
		});
		await sync.syncNow();
		const todo = await repository.getTodoForSync(TODO_ID);
		expect(todo).toMatchObject({ serverRevision: 4, localVersion: 6, isDirty: true });
		expect(todo?.blocks).toEqual([text('two')]);
	});

	it('preserves local content and marks one conflict after PUT 409', async () => {
		await repository.createTodo([text('local')]);
		await database.todos.update(TODO_ID, { serverRevision: 2 });
		const { sync } = engine((url, init) => {
			if (init.method === 'PUT') return json({ code: 'REVISION_CONFLICT', serverRevision: 3 }, 409);
			if (url === '/api/sync/todos') return json([indexItem(3)]);
			throw new Error('Unexpected request');
		});
		const result = await sync.syncNow();
		expect(result.conflicts).toBe(1);
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 2,
			isDirty: true,
			hasSyncConflict: true,
			blocks: [text('local')]
		});
	});

	it('pulls a missing todo and updates a clean older todo', async () => {
		const first = engine((url) =>
			url === '/api/sync/todos' ? json([indexItem(2)]) : json(fullTodo(2, 'first'))
		);
		expect(await first.sync.syncNow()).toMatchObject({ pulled: 1 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 2,
			isDirty: false,
			blocks: [text('first')]
		});
		const second = engine((url) =>
			url === '/api/sync/todos' ? json([indexItem(3)]) : json(fullTodo(3, 'second'))
		);
		expect(await second.sync.syncNow()).toMatchObject({ pulled: 1 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 3,
			blocks: [text('second')]
		});
	});

	it('uses embedded full todos from the index without per-todo requests', async () => {
		const full = fullTodo(2, 'batched');
		const { sync, fetch } = engine((url, init) => {
			if (url === '/api/sync/todos')
				expect(new Headers(init.headers).get('x-sync-include-content')).toBe('1');
			if (url === '/api/sync/todos')
				return json({ todos: [indexItem(2)], revokedTodoIds: [], fullTodos: [full] });
			throw new Error(`Unexpected per-todo request: ${url}`);
		});

		expect(await sync.syncNow()).toMatchObject({ status: 'success', pulled: 1 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 2,
			blocks: [text('batched')]
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('keeps a regranted todo when an index contains both stale revoke and current access', async () => {
		await repository.createTodo([text('old shared')]);
		await database.todos.update(TODO_ID, { serverRevision: 1, isDirty: false });
		let pull = 0;
		const { sync } = engine((url) => {
			if (url === '/api/sync/todos') {
				pull++;
				return json({
					todos: [indexItem(2)],
					revokedTodoIds: pull === 1 ? [TODO_ID] : []
				});
			}
			return json(fullTodo(2, 'regranted'));
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'success', pulled: 1 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 2,
			isDirty: false,
			blocks: [text('regranted')]
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'success', deleted: 0 });
		expect(await database.todos.get(TODO_ID)).toBeDefined();
	});

	it('does not overwrite a mutation made while a pull GET is in flight', async () => {
		await repository.createTodo([text('old')]);
		await database.todos.update(TODO_ID, { serverRevision: 1, isDirty: false });
		const { sync } = engine(async (url) => {
			if (url === '/api/sync/todos') return json([indexItem(2)]);
			await repository.updateTodo(TODO_ID, [text('new local')], []);
			return json(fullTodo(2, 'server'));
		});
		const result = await sync.syncNow();
		expect(result.conflicts).toBe(1);
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 1,
			isDirty: true,
			hasSyncConflict: true,
			blocks: [text('new local')]
		});
	});

	it('removes a clean todo for a newer server tombstone', async () => {
		await repository.createTodo([text('local')]);
		await database.todos.update(TODO_ID, { serverRevision: 1, isDirty: false });
		const { sync } = engine(() => json([indexItem(2, date)]));
		expect(await sync.syncNow()).toMatchObject({ deleted: 1 });
		expect(await database.todos.get(TODO_ID)).toBeUndefined();
		expect(await database.todoBlocks.count()).toBe(0);
	});

	it('preserves a dirty todo when the newer server state is a tombstone', async () => {
		await repository.createTodo([text('local')]);
		await database.todos.update(TODO_ID, { serverRevision: 1 });
		const { sync } = engine((url, init) => {
			if (init.method === 'PUT') return json({ code: 'REVISION_CONFLICT', serverRevision: 2 }, 409);
			if (url === '/api/sync/todos') return json([indexItem(2, date)]);
			throw new Error('Unexpected request');
		});
		expect(await sync.syncNow()).toMatchObject({ conflicts: 1, deleted: 0 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			isDirty: true,
			hasSyncConflict: true,
			blocks: [text('local')]
		});
	});

	it('finalizes a successful delete and preserves a conflicted delete', async () => {
		await repository.createTodo([text('local')]);
		await repository.closeTodo(TODO_ID);
		await database.todos.update(TODO_ID, { serverRevision: 2, isDirty: false });
		await repository.deleteTodo(TODO_ID);
		const success = engine((url, init) =>
			init.method === 'DELETE' ? json({ revision: 3, deletedAt: date }) : json([indexItem(3, date)])
		);
		expect(await success.sync.syncNow()).toMatchObject({ deleted: 1 });
		expect(await database.todos.get(TODO_ID)).toBeUndefined();

		await repository.createTodo([text('again')]);
		await repository.closeTodo(TODO_ID);
		await database.todos.update(TODO_ID, { serverRevision: 4, isDirty: false });
		await repository.deleteTodo(TODO_ID);
		const conflict = engine((url, init) =>
			init.method === 'DELETE'
				? json({ code: 'REVISION_CONFLICT', serverRevision: 5 }, 409)
				: json([indexItem(5)])
		);
		expect(await conflict.sync.syncNow()).toMatchObject({ conflicts: 1, deleted: 0 });
		expect(await database.todos.get(TODO_ID)).toMatchObject({
			isPendingDelete: true,
			hasSyncConflict: true
		});
	});

	it('does not finalize a delete if localVersion changes during DELETE', async () => {
		await repository.createTodo([text('local')]);
		await repository.closeTodo(TODO_ID);
		await database.todos.update(TODO_ID, { serverRevision: 2, isDirty: false });
		await repository.deleteTodo(TODO_ID);
		const { sync } = engine(async (url, init) => {
			if (init.method === 'DELETE') {
				await database.todos
					.where('id')
					.equals(TODO_ID)
					.modify((todo) => {
						todo.localVersion++;
					});
				return json({ revision: 3, deletedAt: date });
			}
			if (url === '/api/sync/todos') return json([indexItem(3, date)]);
			throw new Error('Unexpected request');
		});
		const result = await sync.syncNow();
		expect(result.errors).toContainEqual({
			todoId: TODO_ID,
			operation: 'push-delete',
			code: 'LOCAL_VERSION_CHANGED'
		});
		expect(await database.todos.get(TODO_ID)).toMatchObject({
			localVersion: 4,
			isPendingDelete: true
		});
	});

	it('uploads and pushes a local image todo without binary in sync JSON', async () => {
		await repository.createTodo([imageBlock], [image]);
		let todoBody: Record<string, unknown> | undefined;
		const local = engine((url, init) => {
			if (url.endsWith('prepare-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					uploadUrl: 'https://r2.test/upload',
					expiresInSeconds: 60,
					requiredHeaders: { 'Content-Type': 'image/png' }
				});
			if (url === 'https://r2.test/upload') return new Response(null, { status: 200 });
			if (url.endsWith('confirm-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					sizeBytes: 5
				});
			if (init.method === 'PUT') {
				todoBody = JSON.parse(String(init.body));
				return json({ revision: 1, created: true }, 201);
			}
			if (url === '/api/sync/todos') return json([indexItem(1)]);
			throw new Error('Unexpected request');
		});
		const localResult = await local.sync.syncNow();
		expect(localResult).toMatchObject({ uploadedImages: 1, created: 1 });
		expect(JSON.stringify(todoBody)).not.toMatch(/blob|base64|dataUrl|ArrayBuffer/i);
		expect(todoBody).toMatchObject({
			images: [
				{
					id: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					width: 10,
					height: 10,
					sizeBytes: 5,
					markup: null
				}
			]
		});
		expect(await database.todos.get(TODO_ID)).toMatchObject({
			isDirty: false,
			hasSyncConflict: false
		});
	});

	it('pulls a server image todo and stores its Blob for offline use', async () => {
		const { sync } = engine((url) =>
			url === '/api/sync/todos'
				? json([indexItem(1)])
				: url === 'https://r2.test/download'
					? new Response(new Blob(['image'], { type: 'image/png' }), {
							headers: { 'content-type': 'image/png' }
						})
					: url.includes('/download')
						? json({
								imageId: IMAGE_ID,
								mimeType: 'image/png',
								sizeBytes: 5,
								downloadUrl: 'https://r2.test/download',
								expiresInSeconds: 60
							})
						: json({
								...fullTodo(1),
								blocks: [{ id: BLOCK_ID, type: 'image', position: 0, imageId: IMAGE_ID }],
								images: [
									{
										id: IMAGE_ID,
										storageKey: 'users/u/images/i.png',
										mimeType: 'image/png',
										width: 10,
										height: 10,
										sizeBytes: 5,
										markup: null
									}
								]
							})
		);
		expect(await sync.syncNow()).toMatchObject({ downloadedImages: 1, pulled: 1, conflicts: 0 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 1,
			isDirty: false,
			hasSyncConflict: false,
			blocks: [imageBlock]
		});
		expect(await (await database.todoImages.get(IMAGE_ID))!.blob.text()).toBe('image');
	});

	it('pushes markup-only changes without uploading an existing Blob', async () => {
		await repository.createTodo([imageBlock], [{ ...image, storageKey: 'users/u/images/i.png' }]);
		await database.todos.update(TODO_ID, { serverRevision: 1, isDirty: false });
		await database.imageMarkups.put({ imageId: IMAGE_ID, version: 1, objects: [], updatedAt: 1 });
		await database.todos.update(TODO_ID, { isDirty: true, localVersion: 2 });
		const { sync, fetch } = engine((url, init) => {
			if (url.endsWith('confirm-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					sizeBytes: 5
				});
			if (init.method === 'PUT') {
				expect(JSON.parse(String(init.body))).toMatchObject({
					images: [{ markup: { version: 1, objects: [] } }]
				});
				return json({ revision: 2, created: false });
			}
			return json([indexItem(2)]);
		});
		expect(await sync.syncNow()).toMatchObject({ updated: 1, uploadedImages: 0 });
		expect(fetch.mock.calls.some(([url]) => String(url).includes('prepare-upload'))).toBe(false);
	});

	it('recovers missing dimensions before upload and persists them locally', async () => {
		await repository.createTodo([imageBlock], [{ ...image, width: null, height: null }]);
		const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.endsWith('prepare-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					uploadUrl: 'https://r2.test/upload',
					expiresInSeconds: 60,
					requiredHeaders: { 'Content-Type': 'image/png' }
				});
			if (url === 'https://r2.test/upload') return new Response(null);
			if (url.endsWith('confirm-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					sizeBytes: 5
				});
			if (init?.method === 'PUT') {
				expect(JSON.parse(String(init.body))).toMatchObject({
					images: [{ width: 40, height: 30 }]
				});
				return json({ revision: 1, created: true }, 201);
			}
			return json([indexItem(1)]);
		}) as unknown as typeof globalThis.fetch;
		const sync = createSyncService({
			repository,
			fetch: fetchMock,
			hasAuthenticatedSession: async () => true,
			readImageDimensions: async () => ({ width: 40, height: 30 })
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'success', created: 1 });
		expect(await database.todoImages.get(IMAGE_ID)).toMatchObject({ width: 40, height: 30 });
	});

	it('does not upload or PUT when missing dimensions cannot be decoded', async () => {
		await repository.createTodo([imageBlock], [{ ...image, width: null, height: null }]);
		const fetch = vi.fn() as unknown as typeof globalThis.fetch;
		const sync = createSyncService({
			repository,
			fetch,
			hasAuthenticatedSession: async () => true,
			readImageDimensions: async () => {
				throw new Error('decode failed');
			}
		});
		const result = await sync.pushTodoById(TODO_ID);
		expect(result).toMatchObject({ status: 'partial', created: 0 });
		expect(result.errors).toContainEqual({
			todoId: TODO_ID,
			imageId: IMAGE_ID,
			operation: 'image-upload',
			code: 'IMAGE_DIMENSIONS_UNAVAILABLE',
			status: undefined
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(await database.todos.get(TODO_ID)).toMatchObject({ isDirty: true });
	});

	it('reconfirms an uploaded object instead of uploading it again after todo PUT failure', async () => {
		await repository.createTodo([imageBlock], [image]);
		let todoAttempts = 0;
		const { sync, fetch } = engine((url, init) => {
			if (url.endsWith('prepare-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					uploadUrl: 'https://r2.test/upload',
					expiresInSeconds: 60,
					requiredHeaders: { 'Content-Type': 'image/png' }
				});
			if (url === 'https://r2.test/upload') return new Response(null);
			if (url.endsWith('confirm-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					sizeBytes: 5
				});
			if (init.method === 'PUT') {
				todoAttempts++;
				return todoAttempts === 1
					? json({ code: 'TEMPORARY' }, 400)
					: json({ revision: 1, created: true }, 201);
			}
			return json(todoAttempts > 1 ? [indexItem(1)] : []);
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'partial', created: 0 });
		expect(await database.todoImages.get(IMAGE_ID)).toMatchObject({
			storageKey: 'users/u/images/i.png'
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'success', created: 1 });
		expect(
			fetch.mock.calls.filter(([url]) => String(url) === 'https://r2.test/upload')
		).toHaveLength(1);
		expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('prepare-upload'))).toHaveLength(
			1
		);
	});

	it('does not PUT a stale snapshot when the todo changes during image upload', async () => {
		await repository.createTodo([imageBlock], [image]);
		const { sync, fetch } = engine(async (url) => {
			if (url.endsWith('prepare-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					uploadUrl: 'https://r2.test/upload',
					expiresInSeconds: 60,
					requiredHeaders: { 'Content-Type': 'image/png' }
				});
			if (url === 'https://r2.test/upload') {
				await repository.updateTodo(TODO_ID, [text('new')], []);
				return new Response(null);
			}
			if (url.endsWith('confirm-upload'))
				return json({
					imageId: IMAGE_ID,
					storageKey: 'users/u/images/i.png',
					mimeType: 'image/png',
					sizeBytes: 5
				});
			if (url === '/api/sync/todos') return json([]);
			throw new Error('Stale todo PUT');
		});
		const result = await sync.syncNow();
		expect(result).toMatchObject({ created: 0, uploadedImages: 1 });
		expect(
			fetch.mock.calls.some(
				([url, init]) => String(url).startsWith('/api/sync/todos/') && init?.method === 'PUT'
			)
		).toBe(false);
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			isDirty: true,
			blocks: [text('new')]
		});
		expect(await database.todoImages.get(IMAGE_ID)).toBeUndefined();
	});

	it('reuses an unchanged local Blob during pull', async () => {
		await repository.createTodo([imageBlock], [{ ...image, storageKey: 'users/u/images/i.png' }]);
		await database.todos.update(TODO_ID, { serverRevision: 1, isDirty: false });
		const { sync, fetch } = engine((url) => {
			if (url === '/api/sync/todos') return json([indexItem(2)]);
			if (url.includes('/download')) throw new Error('Download must not run');
			return json({
				...fullTodo(2),
				blocks: [{ id: BLOCK_ID, type: 'image', position: 0, imageId: IMAGE_ID }],
				images: [
					{
						id: IMAGE_ID,
						storageKey: 'users/u/images/i.png',
						mimeType: 'image/png',
						width: 10,
						height: 10,
						sizeBytes: 5,
						markup: null
					}
				]
			});
		});
		expect(await sync.syncNow()).toMatchObject({ pulled: 1, downloadedImages: 0 });
		expect(fetch.mock.calls.some(([url]) => String(url).includes('/download'))).toBe(false);
		expect(await (await database.todoImages.get(IMAGE_ID))!.blob.text()).toBe('image');
	});

	it('preserves dirty state on network failure and does not invent a conflict', async () => {
		await repository.createTodo([text('local')]);
		const { sync } = engine(() => {
			throw new TypeError('offline');
		});
		expect(await sync.syncNow()).toMatchObject({ status: 'failed', conflicts: 0 });
		expect(await database.todos.get(TODO_ID)).toMatchObject({
			isDirty: true,
			hasSyncConflict: false
		});
	});

	it('does nothing when anonymous and preserves data on 401 or 403', async () => {
		await repository.createTodo([text('local')]);
		const fetch = vi.fn() as unknown as typeof globalThis.fetch;
		const anonymous = createSyncService({
			repository,
			fetch,
			hasAuthenticatedSession: async () => false
		});
		expect(await anonymous.syncNow()).toMatchObject({ status: 'unauthenticated' });
		expect(fetch).not.toHaveBeenCalled();
		for (const status of [401, 403]) {
			const { sync } = engine(() => json({}, status));
			expect(await sync.syncNow()).toMatchObject({
				status: status === 401 ? 'unauthorized' : 'forbidden'
			});
			expect(await database.todos.get(TODO_ID)).toMatchObject({
				isDirty: true,
				hasSyncConflict: false
			});
		}
	});

	it('surfaces EMAIL_NOT_VERIFIED as a terminal forbidden reason without touching local data', async () => {
		await repository.createTodo([text('local')]);
		const { sync } = engine(() => json({ message: 'EMAIL_NOT_VERIFIED' }, 403));
		const result = await sync.syncNow();
		expect(result).toMatchObject({
			status: 'forbidden',
			errors: [expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED', status: 403 })]
		});
		expect(await database.todos.get(TODO_ID)).toMatchObject({
			isDirty: true,
			hasSyncConflict: false
		});
	});

	it('targeted pull skips an already-current revision without HTTP', async () => {
		await repository.createTodo([text('current')]);
		await database.todos.update(TODO_ID, { serverRevision: 4, isDirty: false });
		const { sync, fetch } = engine(() => {
			throw new Error('HTTP must not run');
		});
		expect(await sync.pullTodoById(TODO_ID, 4)).toMatchObject({ status: 'success', pulled: 0 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('targeted pull applies a newer clean todo through the shared pull path', async () => {
		await repository.createTodo([text('old')]);
		await database.todos.update(TODO_ID, { serverRevision: 3, isDirty: false });
		const { sync } = engine((url) =>
			url === '/api/sync/todos' ? json([indexItem(4)]) : json(fullTodo(4, 'new'))
		);
		expect(await sync.pullTodoById(TODO_ID, 4)).toMatchObject({ pulled: 1 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({
			serverRevision: 4,
			blocks: [text('new')]
		});
	});

	it('targeted pull verifies tombstones and protects dirty content', async () => {
		await repository.createTodo([text('dirty')]);
		await database.todos.update(TODO_ID, { serverRevision: 3 });
		const dirty = engine(() => json([indexItem(4, date)]));
		expect(await dirty.sync.pullTodoById(TODO_ID, 4)).toMatchObject({ conflicts: 1, deleted: 0 });
		expect(await repository.getTodoForSync(TODO_ID)).toMatchObject({ blocks: [text('dirty')] });
		await database.todos.update(TODO_ID, { isDirty: false, hasSyncConflict: false });
		const clean = engine(() => json([indexItem(4, date)]));
		expect(await clean.sync.pullTodoById(TODO_ID, 4)).toMatchObject({ deleted: 1 });
		expect(await database.todos.get(TODO_ID)).toBeUndefined();
	});
});
