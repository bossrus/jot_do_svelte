export type ServerEvent =
	| { type: 'todo.changed'; todoId: string; revision: number }
	| { type: 'todo.deleted'; todoId: string; revision: number }
	| { type: 'message.changed'; todoId: string; revision: number }
	| { type: 'todo.access-changed'; todoId: string }
	| { type: 'todo.access-revoked'; todoId: string }
	| { type: 'friend-request.changed' }
	| { type: 'todo-access-request.changed' }
	| { type: 'notifications.changed' }
	| { type: 'groups.changed' }
	| { type: 'workers.changed'; todoId: string };

export type PublishServerEvent = (userId: string, event: ServerEvent) => void | Promise<void>;
type Listener = (userId: string, event: ServerEvent) => void;
const listeners = new Set<Listener>();

// Process-local by design. Replace this with shared pub/sub before horizontal scaling.
export const publishServerEvent: PublishServerEvent = (userId, event) => {
	for (const listener of listeners) listener(userId, event);
};

export function subscribeToServerEvents(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
