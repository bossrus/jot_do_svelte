import { z } from 'zod';

const revisionEventPayload = z.object({ todoId: z.uuid(), revision: z.int().positive() });
const accessEventPayload = z.object({ todoId: z.uuid() });

export type TodoSseEvent =
	| { type: 'todo.changed' | 'todo.deleted'; todoId: string; revision: number }
	| { type: 'message.changed'; todoId: string; revision: number }
	| { type: 'todo.access-changed'; todoId: string }
	| { type: 'todo.access-revoked'; todoId: string }
	| { type: 'friend-request.changed' }
	| { type: 'todo-access-request.changed' }
	| { type: 'notifications.changed' }
	| { type: 'groups.changed' }
	| { type: 'workers.changed'; todoId: string };

type EventSourceLike = Pick<EventSource, 'close' | 'addEventListener' | 'onopen' | 'onerror'>;
type Options = {
	createEventSource?: (url: string) => EventSourceLike;
	onEvent: (event: TodoSseEvent) => void;
	onOpen?: (reconnected: boolean) => void;
	onError?: () => void;
};

export function createSseClient(options: Options) {
	const createEventSource =
		options.createEventSource ?? ((url: string): EventSourceLike => new EventSource(url));
	let source: EventSourceLike | null = null;
	let hasOpened = false;

	function start() {
		if (source) return;
		const current = createEventSource('/api/events');
		source = current;
		const listen = (type: TodoSseEvent['type']) =>
			current.addEventListener(type, (raw) => {
				if (source !== current || !(raw instanceof MessageEvent)) return;
				try {
					const data = JSON.parse(String(raw.data));
					if (
						type === 'friend-request.changed' ||
						type === 'todo-access-request.changed' ||
						type === 'notifications.changed' ||
						type === 'groups.changed'
					) {
						options.onEvent({ type });
					} else if (type === 'todo.access-changed' || type === 'todo.access-revoked') {
						const parsed = accessEventPayload.safeParse(data);
						if (parsed.success) options.onEvent({ type, ...parsed.data });
					} else {
						const parsed = revisionEventPayload.safeParse(data);
						if (parsed.success) options.onEvent({ type, ...parsed.data });
					}
				} catch {
					// A malformed invalidation is ignored; HTTP sync remains authoritative.
				}
			});
		listen('todo.changed');
		listen('todo.deleted');
		listen('message.changed');
		listen('todo.access-changed');
		listen('todo.access-revoked');
		listen('friend-request.changed');
		listen('todo-access-request.changed');
		listen('notifications.changed');
		listen('groups.changed');
		listen('workers.changed');
		current.onopen = () => {
			if (source !== current) return;
			const reconnected = hasOpened;
			hasOpened = true;
			options.onOpen?.(reconnected);
		};
		current.onerror = () => {
			if (source === current) options.onError?.();
		};
	}

	function stop() {
		const current = source;
		source = null;
		hasOpened = false;
		current?.close();
	}

	return { start, stop, isStarted: () => source !== null };
}
