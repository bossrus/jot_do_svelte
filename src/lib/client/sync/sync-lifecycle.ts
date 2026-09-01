import type { PullTodoResult, SyncResult } from './sync-service';
import { todoService } from '../db/todo-service';
import { onLocalTodoMutation } from '../db/local-mutations';
import { createAutoPushQueue } from './auto-push';
import { pullTodoById, pushTodoById, syncNow } from './sync-service';
import { createSseClient, type TodoSseEvent } from './sse-client';
import { syncMessages } from './message-sync';

export type SyncRuntimeState = {
	isSyncing: boolean;
	sseConnected: boolean;
	lastSyncAt: Date | null;
	lastError: unknown | null;
	readonly pendingPushCount: number;
	readonly activePushCount: number;
};

const emptyUnauthenticatedResult = (): SyncResult => ({
	status: 'unauthenticated',
	created: 0,
	updated: 0,
	deleted: 0,
	pulled: 0,
	conflicts: 0,
	uploadedImages: 0,
	downloadedImages: 0,
	errors: []
});

type SseClient = ReturnType<typeof createSseClient>;
type Options = {
	syncNow?: (signal?: AbortSignal) => Promise<SyncResult>;
	pullTodoById?: (
		todoId: string,
		revision?: number,
		signal?: AbortSignal
	) => Promise<PullTodoResult>;
	createSseClient?: (handlers: Parameters<typeof createSseClient>[0]) => SseClient;
	addOnlineListener?: (listener: () => void) => () => void;
	pushTodoById?: (todoId: string, signal?: AbortSignal) => Promise<SyncResult>;
	getTodoForSync?: typeof todoService.getTodoForSync;
	removeRevokedTodo?: typeof todoService.removeRevokedTodo;
	syncMessages?: typeof syncMessages;
	isOnline?: () => boolean;
	debounceMs?: number;
};

export function createSyncLifecycle(options: Options = {}) {
	const runSync = options.syncNow ?? syncNow;
	const runPull = options.pullTodoById ?? pullTodoById;
	const runPush = options.pushTodoById ?? pushTodoById;
	const removeRevokedTodo = options.removeRevokedTodo ?? todoService.removeRevokedTodo;
	const runMessageSync = options.syncMessages ?? syncMessages;
	const state: SyncRuntimeState = {
		isSyncing: false,
		sseConnected: false,
		lastSyncAt: null,
		lastError: null,
		pendingPushCount: 0,
		activePushCount: 0
	};
	let activeUserId: string | null = null;
	let syncEnabled = false;
	let generation = 0;
	let generationController = new AbortController();
	let fullSync: Promise<SyncResult> | null = null;
	let pendingFullSync = false;
	let removeOnlineListener: (() => void) | null = null;
	const pending = new Map<string, number>();
	const processing = new Set<string>();
	const pendingMessages = new Map<string, number>();
	const processingMessages = new Set<string>();
	const autoPush = createAutoPushQueue({
		pushTodoById: (todoId) => runPush(todoId, generationController.signal),
		getTodo: options.getTodoForSync ?? todoService.getTodoForSync,
		canPush: () =>
			Boolean(activeUserId) &&
			(options.isOnline?.() ?? (typeof navigator === 'undefined' || navigator.onLine)),
		debounceMs: options.debounceMs,
		async waitForCoordination(todoId) {
			while (fullSync) await fullSync;
			while (processing.has(todoId)) await new Promise((resolve) => setTimeout(resolve, 0));
		},
		onFatal(result) {
			state.lastError = result.errors;
			stopServerLifecycle();
		}
	});
	const removeMutationListener = onLocalTodoMutation((todoId) => autoPush.enqueueTodoPush(todoId));
	Object.defineProperties(state, {
		pendingPushCount: { get: () => autoPush.pendingPushCount, enumerable: true },
		activePushCount: { get: () => autoPush.activePushCount, enumerable: true }
	});

	const sse = (options.createSseClient ?? createSseClient)({
		onEvent: queueEvent,
		onOpen(reconnected) {
			state.sseConnected = true;
			if (reconnected) {
				if (typeof window !== 'undefined') {
					window.dispatchEvent(new CustomEvent('friend-request.changed'));
					window.dispatchEvent(new CustomEvent('notifications.changed'));
				}
				void requestFullSync();
			}
		},
		onError() {
			state.sseConnected = false;
		}
	});

	function installOnlineListener() {
		if (removeOnlineListener) return;
		if (options.addOnlineListener) {
			removeOnlineListener = options.addOnlineListener(() => void requestFullSync());
			return;
		}
		const listener = () => void requestFullSync();
		window.addEventListener('online', listener);
		removeOnlineListener = () => window.removeEventListener('online', listener);
	}

	async function requestFullSync(): Promise<SyncResult> {
		if (!activeUserId || !syncEnabled) return emptyUnauthenticatedResult();
		if (fullSync) {
			pendingFullSync = true;
			return fullSync;
		}
		const startedGeneration = generation;
		state.isSyncing = true;
		fullSync = (async () => {
			if (autoPush.activePushCount) {
				await autoPush.waitForIdle();
				if (startedGeneration !== generation) return emptyUnauthenticatedResult();
			}
			const result = await runSync(generationController.signal);
			if (startedGeneration === generation) {
				state.lastSyncAt = new Date();
				state.lastError =
					result.status === 'failed' || result.status === 'partial' ? result.errors : null;
				if (state.lastError) console.error('Todo synchronization was incomplete', state.lastError);
				if (result.status === 'unauthorized' || result.status === 'forbidden')
					stopServerLifecycle();
			}
			return result;
		})().finally(() => {
			if (startedGeneration === generation) {
				state.isSyncing = false;
				fullSync = null;
			}
		});
		const result = await fullSync;
		if (startedGeneration === generation) {
			await drainPending();
			if (pendingFullSync) {
				pendingFullSync = false;
				return requestFullSync();
			}
		}
		return result;
	}

	function queueEvent(event: TodoSseEvent) {
		if (!activeUserId) return;
		if (
			event.type === 'friend-request.changed' ||
			event.type === 'todo-access-request.changed' ||
			event.type === 'notifications.changed' ||
			event.type === 'groups.changed'
		) {
			if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(event.type));
			if (event.type === 'groups.changed') void requestFullSync();
			return;
		}
		if (event.type === 'workers.changed') {
			void requestFullSync();
			return;
		}
		if (event.type === 'todo.access-changed') {
			void requestFullSync();
			return;
		}
		if (event.type === 'todo.access-revoked') {
			autoPush.cancelTodoPush(event.todoId);
			pending.delete(event.todoId);
			void removeRevokedTodo(event.todoId).catch((error) => {
				state.lastError = error;
				void requestFullSync();
			});
			return;
		}
		if (event.type === 'message.changed') {
			pendingMessages.set(
				event.todoId,
				Math.max(pendingMessages.get(event.todoId) ?? 0, event.revision)
			);
			void processMessages(event.todoId);
			return;
		}
		pending.set(event.todoId, Math.max(pending.get(event.todoId) ?? 0, event.revision));
		if (!fullSync) void processTodo(event.todoId);
	}

	async function processTodo(todoId: string) {
		if (processing.has(todoId) || !activeUserId) return;
		processing.add(todoId);
		const startedGeneration = generation;
		try {
			while (startedGeneration === generation && activeUserId) {
				const revision = pending.get(todoId);
				if (revision === undefined) break;
				pending.delete(todoId);
				try {
					const result = await runPull(todoId, revision, generationController.signal);
					if (startedGeneration !== generation) break;
					if (result.status === 'unauthorized' || result.status === 'forbidden') {
						stopServerLifecycle();
						break;
					}
					if (result.status === 'failed' || result.status === 'partial')
						state.lastError = result.errors;
				} catch (error) {
					if (startedGeneration === generation) state.lastError = error;
				}
			}
		} finally {
			processing.delete(todoId);
		}
	}

	async function drainPending() {
		await Promise.all([...pending.keys()].map(processTodo));
	}

	async function processMessages(todoId: string) {
		if (processingMessages.has(todoId) || !activeUserId) return;
		processingMessages.add(todoId);
		const startedGeneration = generation;
		try {
			while (startedGeneration === generation && activeUserId) {
				if (!pendingMessages.has(todoId)) break;
				pendingMessages.delete(todoId);
				try {
					await runMessageSync(todoId);
				} catch (error) {
					if (startedGeneration === generation) state.lastError = error;
				}
			}
		} finally {
			processingMessages.delete(todoId);
			if (pendingMessages.has(todoId) && activeUserId) void processMessages(todoId);
		}
	}

	function stopServerLifecycle() {
		sse.stop();
		state.sseConnected = false;
		pending.clear();
		pendingMessages.clear();
		autoPush.cancelAll();
	}

	function setAuthenticatedUser(userId: string | null, enableSync = true) {
		if (userId === activeUserId && enableSync === syncEnabled) return null;
		generationController.abort();
		generationController = new AbortController();
		generation++;
		activeUserId = userId;
		syncEnabled = Boolean(userId && enableSync);
		fullSync = null;
		state.isSyncing = false;
		pending.clear();
		pendingFullSync = false;
		stopServerLifecycle();
		if (!userId || !syncEnabled) return null;
		installOnlineListener();
		sse.start();
		return requestFullSync();
	}

	function destroy() {
		generationController.abort();
		generation++;
		activeUserId = null;
		syncEnabled = false;
		stopServerLifecycle();
		removeOnlineListener?.();
		removeOnlineListener = null;
		removeMutationListener();
	}

	return {
		state,
		setAuthenticatedUser,
		requestFullSync,
		enqueueTodoPush: autoPush.enqueueTodoPush,
		cancelTodoPush: autoPush.cancelTodoPush,
		flushTodoPush: autoPush.flushTodoPush,
		destroy
	};
}

export const syncLifecycle = createSyncLifecycle();
