import { describe, expect, it, vi } from 'vitest';
import { publishServerEvent, subscribeToServerEvents } from './events';

describe('server events', () => {
	it('publishes only an invalidation payload', () => {
		const listener = vi.fn();
		const unsubscribe = subscribeToServerEvents(listener);
		publishServerEvent('user-id', { type: 'todo.changed', todoId: 'todo-id', revision: 2 });
		expect(listener).toHaveBeenCalledWith('user-id', {
			type: 'todo.changed',
			todoId: 'todo-id',
			revision: 2
		});
		unsubscribe();
	});
});
