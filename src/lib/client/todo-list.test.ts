import { describe, expect, it } from 'vitest';
import type { LocalTodoWithImages } from './db/database';
import { filterTodos, pageCount, pageItems, type TodoListFilters } from './todo-list';

function todo(
	id: string,
	text: string,
	createdAt: number,
	closedAt: number | null = null
): LocalTodoWithImages {
	return {
		id,
		ownerId: null,
		status: closedAt === null ? 'active' : 'closed',
		createdAt,
		updatedAt: createdAt,
		closedAt,
		deletedAt: null,
		serverRevision: null,
		localVersion: 1,
		isDirty: true,
		isPendingDelete: false,
		hasSyncConflict: false,
		blocks: [{ id: `${id}-text`, type: 'text', text }],
		images: [],
		workers: []
	};
}

const baseFilters: TodoListFilters = {
	status: 'active',
	searchQuery: '',
	selectedGroupId: '',
	openedFrom: '',
	openedTo: '',
	closedFrom: '',
	closedTo: ''
};

describe('filterTodos', () => {
	const firstDay = new Date('2026-09-01T12:00:00').getTime();
	const secondDay = new Date('2026-09-02T12:00:00').getTime();
	const todos = [todo('one', 'Buy milk', firstDay), todo('two', 'Call Alice', secondDay)];

	it('searches task text and indexed chat text case-insensitively', () => {
		expect(filterTodos(todos, [], new Map(), { ...baseFilters, searchQuery: 'MILK' })).toEqual([
			todos[0]
		]);
		expect(
			filterTodos(todos, [], new Map([['two', 'Project Phoenix']]), {
				...baseFilters,
				searchQuery: 'phoenix'
			})
		).toEqual([todos[1]]);
	});

	it('combines contact-group and inclusive date filters', () => {
		expect(
			filterTodos(
				todos,
				[{ id: 'group', name: 'Team', ownerId: 'owner', todoIds: ['two'] }],
				new Map(),
				{
					...baseFilters,
					selectedGroupId: 'group',
					openedFrom: '2026-09-02',
					openedTo: '2026-09-02'
				}
			)
		).toEqual([todos[1]]);
	});

	it('applies closed-date filters only to the closed list', () => {
		const closed = todo('closed', 'Done', firstDay, secondDay);
		expect(
			filterTodos([closed], [], new Map(), {
				...baseFilters,
				status: 'closed',
				closedFrom: '2026-09-02',
				closedTo: '2026-09-02'
			})
		).toEqual([closed]);
	});
});

describe('pagination', () => {
	it('always exposes at least one page and slices the requested page', () => {
		expect(pageCount(0, 10)).toBe(1);
		expect(pageCount(21, 10)).toBe(3);
		expect(pageItems([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
	});
});
