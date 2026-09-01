import { describe, expect, it, vi } from 'vitest';
import type { SyncResult } from './sync-service';
import { createSyncLifecycle } from './sync-lifecycle';
import type { TodoSseEvent } from './sse-client';

const result = (status: SyncResult['status'] = 'success'): SyncResult => ({
	status,
	created: 0,
	updated: 0,
	deleted: 0,
	pulled: 0,
	conflicts: 0,
	uploadedImages: 0,
	downloadedImages: 0,
	errors: []
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(sync = vi.fn(async () => result())) {
	let handlers!: {
		onEvent: (event: TodoSseEvent) => void;
		onOpen?: (reconnected: boolean) => void;
		onError?: () => void;
	};
	let online!: () => void;
	const sse = { start: vi.fn(), stop: vi.fn(), isStarted: vi.fn(() => true) };
	const pull = vi.fn(async () => result());
	const removeRevokedTodo = vi.fn(async () => true);
	const messageSync = vi.fn(async () => undefined);
	const lifecycle = createSyncLifecycle({
		syncNow: sync,
		pullTodoById: pull,
		createSseClient(value) {
			handlers = value;
			return sse;
		},
		addOnlineListener(listener) {
			online = listener;
			return vi.fn();
		},
		removeRevokedTodo,
		syncMessages: messageSync
	});
	return {
		lifecycle,
		sync,
		pull,
		removeRevokedTodo,
		messageSync,
		sse,
		event: (event: TodoSseEvent) => handlers.onEvent(event),
		open: (reconnected: boolean) => handlers.onOpen?.(reconnected),
		online: () => online()
	};
}

describe('sync lifecycle', () => {
	it('does nothing for anonymous startup and starts once after login', async () => {
		const h = harness();
		h.lifecycle.setAuthenticatedUser(null);
		expect(h.sync).not.toHaveBeenCalled();
		expect(h.sse.start).not.toHaveBeenCalled();
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		expect(h.sync).toHaveBeenCalledTimes(1);
		expect(h.sse.start).toHaveBeenCalledTimes(1);
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		expect(h.sync).toHaveBeenCalledTimes(1);
		expect(h.sse.start).toHaveBeenCalledTimes(1);
	});

	it('closes on logout and ignores later events', async () => {
		const h = harness();
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		h.lifecycle.setAuthenticatedUser(null);
		h.event({ type: 'todo.changed', todoId: crypto.randomUUID(), revision: 2 });
		await tick();
		expect(h.sse.stop).toHaveBeenCalled();
		expect(h.pull).not.toHaveBeenCalled();
	});

	it('full syncs after reconnect and online only while authenticated', async () => {
		const h = harness();
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		h.open(false);
		await tick();
		expect(h.sync).toHaveBeenCalledTimes(1);
		h.open(true);
		await tick();
		h.online();
		await tick();
		expect(h.sync).toHaveBeenCalledTimes(3);
		h.lifecycle.setAuthenticatedUser(null);
		h.online();
		await tick();
		expect(h.sync).toHaveBeenCalledTimes(3);
	});

	it('immediately removes a todo after access is revoked', async () => {
		const h = harness();
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		const todoId = crypto.randomUUID();
		h.event({ type: 'todo.access-revoked', todoId });
		await tick();
		expect(h.removeRevokedTodo).toHaveBeenCalledWith(todoId);
		expect(h.pull).not.toHaveBeenCalled();
	});

	it('syncs chat directly when another participant changes a message', async () => {
		const h = harness();
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		const todoId = crypto.randomUUID();
		h.event({ type: 'message.changed', todoId, revision: 1 });
		await tick();
		expect(h.messageSync).toHaveBeenCalledWith(todoId);
		expect(h.pull).not.toHaveBeenCalled();
	});

	it('coalesces rapid message events and never syncs one chat concurrently', async () => {
		let release!: () => void;
		const first = new Promise<undefined>((resolve) => (release = () => resolve(undefined)));
		const h = harness();
		h.messageSync.mockImplementationOnce(async () => first);
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		const todoId = crypto.randomUUID();
		h.event({ type: 'message.changed', todoId, revision: 1 });
		await tick();
		h.event({ type: 'message.changed', todoId, revision: 2 });
		h.event({ type: 'message.changed', todoId, revision: 3 });
		expect(h.messageSync).toHaveBeenCalledTimes(1);
		release();
		await tick();
		await tick();
		expect(h.messageSync).toHaveBeenCalledTimes(2);
		expect(h.pull).not.toHaveBeenCalled();
	});

	it('retains partial sync errors in runtime state', async () => {
		const partial = result('partial');
		partial.errors = [
			{
				todoId: crypto.randomUUID(),
				operation: 'image-upload',
				code: 'IMAGE_DIMENSIONS_UNAVAILABLE'
			}
		];
		const h = harness(vi.fn(async () => partial));
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		expect(h.lifecycle.state.lastError).toEqual(partial.errors);
		expect(h.sse.stop).not.toHaveBeenCalledTimes(2);
	});

	it('coalesces revisions and never pulls one todo concurrently', async () => {
		let release!: () => void;
		const first = new Promise<void>((resolve) => (release = resolve));
		const h = harness();
		h.pull.mockImplementationOnce(async () => {
			await first;
			return result();
		});
		h.lifecycle.setAuthenticatedUser('user-a');
		await tick();
		const todoId = crypto.randomUUID();
		h.event({ type: 'todo.changed', todoId, revision: 4 });
		await tick();
		h.event({ type: 'todo.changed', todoId, revision: 5 });
		h.event({ type: 'todo.deleted', todoId, revision: 6 });
		expect(h.pull).toHaveBeenCalledTimes(1);
		release();
		await tick();
		await tick();
		expect(h.pull).toHaveBeenCalledTimes(2);
		expect(h.pull).toHaveBeenLastCalledWith(todoId, 6, expect.any(AbortSignal));
	});

	it('serializes full-sync triggers and drains an event afterward', async () => {
		let release!: () => void;
		const pending = new Promise<SyncResult>((resolve) => (release = () => resolve(result())));
		const sync = vi.fn(() => pending);
		const h = harness(sync);
		h.lifecycle.setAuthenticatedUser('user-a');
		h.online();
		h.open(true);
		const todoId = crypto.randomUUID();
		h.event({ type: 'todo.changed', todoId, revision: 3 });
		expect(sync).toHaveBeenCalledTimes(1);
		expect(h.pull).not.toHaveBeenCalled();
		release();
		await tick();
		expect(h.pull).toHaveBeenCalledWith(todoId, 3, expect.any(AbortSignal));
		expect(sync.mock.results.filter((item) => item.type === 'return')).toHaveLength(2);
	});

	it('ignores old-user orchestration after an auth generation change', async () => {
		let release!: () => void;
		const first = new Promise<SyncResult>((resolve) => (release = () => resolve(result())));
		const sync = vi
			.fn()
			.mockImplementationOnce(() => first)
			.mockResolvedValue(result());
		const h = harness(sync);
		h.lifecycle.setAuthenticatedUser('user-a');
		h.lifecycle.setAuthenticatedUser(null);
		h.lifecycle.setAuthenticatedUser('user-b');
		release();
		await tick();
		await tick();
		expect(h.sse.start).toHaveBeenCalledTimes(2);
		expect(h.lifecycle.state.isSyncing).toBe(false);
	});
});
