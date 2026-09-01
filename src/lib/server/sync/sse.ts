import { subscribeToServerEvents, type ServerEvent } from './events';

export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;

const encoder = new TextEncoder();

export function formatServerEvent(event: ServerEvent): Uint8Array {
	const { type, ...data } = event;
	return encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createServerEventStream(
	userId: string,
	signal: AbortSignal
): ReadableStream<Uint8Array> {
	let cleanup = () => {};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			let cleanedUp = false;
			let unsubscribe = () => {};

			cleanup = () => {
				if (cleanedUp) return;
				cleanedUp = true;
				signal.removeEventListener('abort', cleanup);
				unsubscribe();
				clearInterval(heartbeat);
				try {
					controller.close();
				} catch {
					// The consumer may already have cancelled the stream.
				}
			};

			const send = (payload: Uint8Array) => {
				if (cleanedUp) return;
				try {
					controller.enqueue(payload);
				} catch {
					cleanup();
				}
			};

			unsubscribe = subscribeToServerEvents((eventUserId, event) => {
				if (eventUserId === userId) send(formatServerEvent(event));
			});

			const heartbeat = setInterval(
				() => send(encoder.encode(': heartbeat\n\n')),
				SSE_HEARTBEAT_INTERVAL_MS
			);

			signal.addEventListener('abort', cleanup, { once: true });
			if (signal.aborted) cleanup();
		},
		cancel() {
			cleanup();
		}
	});
}
