import type { LocalTodoWithImages } from '../db/database';
import type { SyncResult } from './sync-service';

export const AUTO_PUSH_DEBOUNCE_MS = 500;

type Timer = ReturnType<typeof setTimeout>;
type Options = {
	pushTodoById: (todoId: string, signal?: AbortSignal) => Promise<SyncResult>;
	getTodo: (todoId: string) => Promise<LocalTodoWithImages | undefined>;
	canPush: () => boolean;
	waitForCoordination?: (todoId: string) => Promise<void>;
	onFatal?: (result: SyncResult) => void;
	debounceMs?: number;
};

export function createAutoPushQueue(options: Options) {
	const debounceMs = options.debounceMs ?? AUTO_PUSH_DEBOUNCE_MS;
	const timers = new Map<string, Timer>();
	const active = new Map<string, Promise<void>>();
	const queuedDuringPush = new Set<string>();
	let generation = 0;

	function cancelTimer(todoId: string) {
		const timer = timers.get(todoId);
		if (timer !== undefined) clearTimeout(timer);
		timers.delete(todoId);
	}

	function schedule(todoId: string) {
		cancelTimer(todoId);
		const scheduledGeneration = generation;
		timers.set(
			todoId,
			setTimeout(() => {
				timers.delete(todoId);
				if (scheduledGeneration === generation) void run(todoId, scheduledGeneration);
			}, debounceMs)
		);
	}

	function enqueueTodoPush(todoId: string) {
		if (!options.canPush()) return;
		if (active.has(todoId)) queuedDuringPush.add(todoId);
		schedule(todoId);
	}

	async function run(todoId: string, startedGeneration = generation): Promise<void> {
		if (startedGeneration !== generation || !options.canPush()) return;
		if (active.has(todoId)) {
			queuedDuringPush.add(todoId);
			return;
		}
		const operation = (async () => {
			await options.waitForCoordination?.(todoId);
			if (startedGeneration !== generation || !options.canPush()) return;
			const beforePush = await options.getTodo(todoId);
			if (
				startedGeneration !== generation ||
				!beforePush ||
				beforePush.hasSyncConflict ||
				(!beforePush.isDirty && !beforePush.isPendingDelete)
			)
				return;
			const result = await options.pushTodoById(todoId);
			if (startedGeneration !== generation) return;
			if (result.status === 'unauthorized' || result.status === 'forbidden') {
				options.onFatal?.(result);
				return;
			}
			if (result.status === 'failed') return;
			const todo = await options.getTodo(todoId);
			if (startedGeneration !== generation || !todo || todo.hasSyncConflict) return;
			if (todo.isDirty && queuedDuringPush.has(todoId)) schedule(todoId);
		})();
		active.set(todoId, operation);
		try {
			await operation;
		} finally {
			active.delete(todoId);
			queuedDuringPush.delete(todoId);
		}
	}

	function cancelTodoPush(todoId: string) {
		cancelTimer(todoId);
		queuedDuringPush.delete(todoId);
	}

	function cancelAll() {
		generation++;
		for (const todoId of timers.keys()) cancelTimer(todoId);
		queuedDuringPush.clear();
	}

	async function flushTodoPush(todoId?: string): Promise<void> {
		const ids = todoId ? [todoId] : [...new Set([...timers.keys(), ...active.keys()])];
		await Promise.all(
			ids.map(async (id) => {
				cancelTimer(id);
				await active.get(id);
				await run(id);
			})
		);
	}

	async function waitForIdle(): Promise<void> {
		await Promise.all(active.values());
	}

	return {
		enqueueTodoPush,
		cancelTodoPush,
		flushTodoPush,
		cancelAll,
		waitForIdle,
		get pendingPushCount() {
			return timers.size;
		},
		get activePushCount() {
			return active.size;
		}
	};
}

export type AutoPushQueue = ReturnType<typeof createAutoPushQueue>;
