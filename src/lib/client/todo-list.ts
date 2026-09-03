import type { LocalTodoStatus, LocalTodoWithImages } from './db/database';

export type TodoFilterGroup = {
	id: string;
	name: string;
	ownerId: string;
	todoIds: string[];
};

export type TodoListFilters = {
	status: LocalTodoStatus;
	searchQuery: string;
	selectedGroupId: string;
	openedFrom: string;
	openedTo: string;
	closedFrom: string;
	closedTo: string;
};

function dayBoundary(value: string, endOfDay = false): number | null {
	if (!value) return null;
	return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).getTime();
}

export function filterTodos(
	todos: LocalTodoWithImages[],
	groups: TodoFilterGroup[],
	commentSearchText: ReadonlyMap<string, string>,
	filters: TodoListFilters
): LocalTodoWithImages[] {
	const query = filters.searchQuery.trim().toLocaleLowerCase();
	const selectedGroup = groups.find((group) => group.id === filters.selectedGroupId);
	const groupTodoIds = selectedGroup ? new Set(selectedGroup.todoIds) : null;
	const openedStart = dayBoundary(filters.openedFrom);
	const openedEnd = dayBoundary(filters.openedTo, true);
	const closedStart = dayBoundary(filters.closedFrom);
	const closedEnd = dayBoundary(filters.closedTo, true);

	return todos.filter((todo) => {
		if (groupTodoIds && !groupTodoIds.has(todo.id)) return false;
		if (openedStart !== null && todo.createdAt < openedStart) return false;
		if (openedEnd !== null && todo.createdAt > openedEnd) return false;
		if (
			filters.status === 'closed' &&
			closedStart !== null &&
			(todo.closedAt === null || todo.closedAt < closedStart)
		)
			return false;
		if (
			filters.status === 'closed' &&
			closedEnd !== null &&
			(todo.closedAt === null || todo.closedAt > closedEnd)
		)
			return false;
		if (!query) return true;

		const taskText = todo.blocks
			.flatMap((block) => (block.type === 'text' ? [block.text] : []))
			.join(' ');
		return `${taskText} ${commentSearchText.get(todo.id) ?? ''}`
			.toLocaleLowerCase()
			.includes(query);
	});
}

export function pageCount(itemCount: number, pageSize: number): number {
	return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function pageItems<T>(items: T[], page: number, pageSize: number): T[] {
	return items.slice((page - 1) * pageSize, page * pageSize);
}
