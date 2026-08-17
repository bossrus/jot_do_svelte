import Dexie, { type EntityTable } from 'dexie';

export type LocalTodoStatus = 'active' | 'closed';

export interface LocalTodo {
	id: string;
	text: string;
	status: LocalTodoStatus;
	createdAt: number;
	updatedAt: number;
	closedAt: number | null;
	deletedAt: number | null;
}

export interface LocalTodoImage {
	id: string;
	todoId: string;
	blob: Blob;
	mimeType: string;
	width: number | null;
	height: number | null;
	sizeBytes: number;
	sortOrder: number;
	createdAt: number;
	fileName?: string;
}

export interface LocalTodoWithImages extends LocalTodo {
	images: LocalTodoImage[];
}

export class QuickTodoDatabase extends Dexie {
	todos!: EntityTable<LocalTodo, 'id'>;
	todoImages!: EntityTable<LocalTodoImage, 'id'>;

	constructor(name = 'quick-todo') {
		super(name);

		this.version(1).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt'
		});

		this.version(2).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, [todoId+sortOrder], createdAt'
		});
	}
}

export const todoDb = new QuickTodoDatabase();
