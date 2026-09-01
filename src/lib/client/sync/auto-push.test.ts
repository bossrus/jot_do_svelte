import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalTodoWithImages } from '../db/database';
import type { SyncResult } from './sync-service';
import { AUTO_PUSH_DEBOUNCE_MS, createAutoPushQueue } from './auto-push';

const success = (): SyncResult => ({
	status: 'success',
	created: 0,
	updated: 1,
	deleted: 0,
	pulled: 0,
	conflicts: 0,
	uploadedImages: 0,
	downloadedImages: 0,
	errors: []
});

const todo = (overrides: Partial<LocalTodoWithImages> = {}): LocalTodoWithImages =>
	({ isDirty: true, hasSyncConflict: false, ...overrides }) as LocalTodoWithImages;

afterEach(() => vi.useRealTimers());

describe('automatic todo push queue', () => {
	it('debounces each todo independently from its latest mutation', async () => {
		vi.useFakeTimers();
		const push = vi.fn<(todoId: string) => Promise<SyncResult>>(async () => success());
		const queue = createAutoPushQueue({
			pushTodoById: push,
			getTodo: async () => todo(),
			canPush: () => true
		});
		queue.enqueueTodoPush('a');
		await vi.advanceTimersByTimeAsync(100);
		queue.enqueueTodoPush('a');
		queue.enqueueTodoPush('b');
		await vi.advanceTimersByTimeAsync(100);
		queue.enqueueTodoPush('a');
		await vi.advanceTimersByTimeAsync(AUTO_PUSH_DEBOUNCE_MS - 101);
		expect(push).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(push).toHaveBeenCalledWith('b');
		await vi.advanceTimersByTimeAsync(100);
		expect(push.mock.calls.map(([id]) => id)).toEqual(['b', 'a']);
	});

	it('never overlaps one todo and follows a mutation during push with another debounce', async () => {
		vi.useFakeTimers();
		let release!: () => void;
		let dirty = true;
		const push = vi
			.fn<(_id: string) => Promise<SyncResult>>()
			.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(success()))))
			.mockImplementationOnce(async () => {
				dirty = false;
				return success();
			});
		const queue = createAutoPushQueue({
			pushTodoById: push,
			getTodo: async () => todo({ isDirty: dirty }),
			canPush: () => true
		});
		queue.enqueueTodoPush('a');
		await vi.advanceTimersByTimeAsync(500);
		queue.enqueueTodoPush('a');
		await vi.advanceTimersByTimeAsync(500);
		expect(push).toHaveBeenCalledTimes(1);
		release();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(500);
		expect(push).toHaveBeenCalledTimes(2);
	});

	it('does not retry conflicts, failures, offline work, or cancelled auth generations', async () => {
		vi.useFakeTimers();
		let online = true;
		const conflict = { ...success(), status: 'partial' as const, conflicts: 1 };
		const push = vi
			.fn()
			.mockResolvedValueOnce(conflict)
			.mockResolvedValueOnce({ ...success(), status: 'failed' as const });
		const queue = createAutoPushQueue({
			pushTodoById: push,
			getTodo: async (id) =>
				todo({ isDirty: true, hasSyncConflict: id === 'conflict' && push.mock.calls.length === 1 }),
			canPush: () => online
		});
		queue.enqueueTodoPush('conflict');
		await vi.advanceTimersByTimeAsync(2_000);
		expect(push).toHaveBeenCalledTimes(1);
		queue.enqueueTodoPush('failure');
		await vi.advanceTimersByTimeAsync(2_000);
		expect(push).toHaveBeenCalledTimes(2);
		online = false;
		queue.enqueueTodoPush('offline');
		await vi.advanceTimersByTimeAsync(1_000);
		expect(push).toHaveBeenCalledTimes(2);
		online = true;
		queue.enqueueTodoPush('logout');
		queue.cancelAll();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(push).toHaveBeenCalledTimes(2);
	});
});
