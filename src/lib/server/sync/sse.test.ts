import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishServerEvent } from './events';
import { createServerEventStream, formatServerEvent, SSE_HEARTBEAT_INTERVAL_MS } from './sse';

const decoder = new TextDecoder();

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
	const result = await reader.read();
	return result.value ? decoder.decode(result.value) : '';
}

afterEach(() => vi.useRealTimers());

describe('SSE transport', () => {
	it('formats changed and deleted invalidations without repeating type', () => {
		expect(
			decoder.decode(formatServerEvent({ type: 'todo.changed', todoId: 'todo-1', revision: 2 }))
		).toBe('event: todo.changed\ndata: {"todoId":"todo-1","revision":2}\n\n');
		expect(
			decoder.decode(formatServerEvent({ type: 'todo.deleted', todoId: 'todo-1', revision: 3 }))
		).toBe('event: todo.deleted\ndata: {"todoId":"todo-1","revision":3}\n\n');
		expect(decoder.decode(formatServerEvent({ type: 'friend-request.changed' }))).toBe(
			'event: friend-request.changed\ndata: {}\n\n'
		);
		expect(
			decoder.decode(formatServerEvent({ type: 'todo.access-revoked', todoId: 'todo-1' }))
		).toBe('event: todo.access-revoked\ndata: {"todoId":"todo-1"}\n\n');
	});

	it('isolates users without leaving the other stream waiting', async () => {
		const abortA = new AbortController();
		const abortB = new AbortController();
		const readerA = createServerEventStream('user-a', abortA.signal).getReader();
		const readerB = createServerEventStream('user-b', abortB.signal).getReader();

		publishServerEvent('user-a', { type: 'todo.changed', todoId: 'todo-1', revision: 2 });
		expect(await readChunk(readerA)).toContain('event: todo.changed');

		abortB.abort();
		expect((await readerB.read()).done).toBe(true);
		abortA.abort();
	});

	it('delivers the same event to multiple connections', async () => {
		const firstAbort = new AbortController();
		const secondAbort = new AbortController();
		const first = createServerEventStream('user-a', firstAbort.signal).getReader();
		const second = createServerEventStream('user-a', secondAbort.signal).getReader();

		publishServerEvent('user-a', { type: 'todo.deleted', todoId: 'todo-1', revision: 4 });
		expect(await readChunk(first)).toContain('event: todo.deleted');
		expect(await readChunk(second)).toContain('event: todo.deleted');
		firstAbort.abort();
		secondAbort.abort();
	});

	it('sends heartbeat comments at the configured interval', async () => {
		vi.useFakeTimers();
		const abort = new AbortController();
		const reader = createServerEventStream('user-a', abort.signal).getReader();
		await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_INTERVAL_MS);
		expect(await readChunk(reader)).toBe(': heartbeat\n\n');
		abort.abort();
	});

	it('cleans up an aborted connection without affecting another connection', async () => {
		vi.useFakeTimers();
		const failedAbort = new AbortController();
		const liveAbort = new AbortController();
		const failed = createServerEventStream('user-a', failedAbort.signal).getReader();
		const live = createServerEventStream('user-a', liveAbort.signal).getReader();

		failedAbort.abort();
		expect((await failed.read()).done).toBe(true);
		expect(vi.getTimerCount()).toBe(1);

		publishServerEvent('user-a', { type: 'todo.changed', todoId: 'todo-2', revision: 5 });
		expect(await readChunk(live)).toContain('"revision":5');
		liveAbort.abort();
		expect(vi.getTimerCount()).toBe(0);
	});
});
