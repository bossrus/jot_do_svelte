export type LocalTodoMutationListener = (todoId: string) => void;

const listeners = new Set<LocalTodoMutationListener>();

export function notifyLocalTodoMutation(todoId: string): void {
	for (const listener of listeners) listener(todoId);
}

export function onLocalTodoMutation(listener: LocalTodoMutationListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
