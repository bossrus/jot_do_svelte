import Dexie, { type EntityTable } from 'dexie';
import type { TodoContentBlock } from '../content-blocks';
import type { StoredImageMarkup } from '../markup/types';

export type LocalTodoStatus = 'active' | 'closed';

export interface LocalTodo {
	id: string;
	ownerId: string | null;
	ownerName?: string | null;
	text?: string;
	status: LocalTodoStatus;
	createdAt: number;
	updatedAt: number;
	closedAt: number | null;
	deletedAt: number | null;
	serverRevision: number | null;
	localVersion: number;
	isDirty: boolean;
	isPendingDelete: boolean;
	hasSyncConflict: boolean;
	isAutomatic?: boolean;
	recurringTemplateId?: string | null;
}

export interface LocalTodoImage {
	id: string;
	todoId: string;
	blob: Blob;
	mimeType: string;
	width: number | null;
	height: number | null;
	sizeBytes: number;
	createdAt: number;
	fileName?: string;
	storageKey: string | null;
}

export interface LocalTodoWithImages extends LocalTodo {
	blocks: TodoContentBlock[];
	images: LocalTodoImage[];
	workers: LocalTodoWorker[];
}

export interface LocalTodoWorker {
	id: string;
	todoId: string;
	userId: string;
	name: string;
	state: 'doing' | 'done';
	startedAt: number;
	finishedAt: number | null;
}

export interface LocalTodoBlock {
	id: string;
	todoId: string;
	type: 'text' | 'image';
	position: number;
	text: string | null;
	imageId: string | null;
}

export interface LocalMessage {
	id: string;
	todoId: string;
	authorId: string | null;
	authorName: string;
	type: 'user' | 'system';
	eventType: string | null;
	createdAt: number;
	updatedAt: number;
	serverRevision: number | null;
	localVersion: number;
	isDirty: boolean;
}
export interface LocalMessageBlock {
	id: string;
	messageId: string;
	type: 'text' | 'image';
	position: number;
	text: string | null;
	imageId: string | null;
}
export interface LocalMessageImage extends Omit<LocalTodoImage, 'todoId'> {
	messageId: string;
}
export interface LocalDialogReadState {
	todoId: string;
	readUserMessagesCount: number;
	unreadCount: number;
	updatedAt: number;
}

export class QuickTodoDatabase extends Dexie {
	todos!: EntityTable<LocalTodo, 'id'>;
	todoImages!: EntityTable<LocalTodoImage, 'id'>;
	todoBlocks!: EntityTable<LocalTodoBlock, 'id'>;
	imageMarkups!: EntityTable<StoredImageMarkup, 'imageId'>;
	messages!: EntityTable<LocalMessage, 'id'>;
	messageBlocks!: EntityTable<LocalMessageBlock, 'id'>;
	messageImages!: EntityTable<LocalMessageImage, 'id'>;
	dialogReadStates!: EntityTable<LocalDialogReadState, 'todoId'>;
	todoWorkers!: EntityTable<LocalTodoWorker, 'id'>;

	constructor(name = 'quick-todo') {
		super(name);

		this.version(1).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt'
		});

		this.version(2).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, [todoId+sortOrder], createdAt'
		});

		this.version(3)
			.stores({
				todos: 'id, status, createdAt, updatedAt, deletedAt',
				todoImages: 'id, todoId, createdAt',
				todoBlocks: 'id, todoId, [todoId+position], type, imageId'
			})
			.upgrade(async (transaction) => {
				const todos = await transaction.table<LocalTodo>('todos').toArray();
				const imagesTable = transaction.table<LocalTodoImage & { sortOrder?: number }>(
					'todoImages'
				);
				const blocksTable = transaction.table<LocalTodoBlock>('todoBlocks');
				for (const todo of todos) {
					const images = (await imagesTable.where('todoId').equals(todo.id).toArray()).sort(
						(a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
					);
					const blocks: LocalTodoBlock[] = [];
					if (todo.text) {
						for (const line of todo.text.replace(/\r\n?/g, '\n').split('\n')) {
							blocks.push({
								id: crypto.randomUUID(),
								todoId: todo.id,
								type: 'text',
								position: blocks.length,
								text: line,
								imageId: null
							});
						}
					}
					for (const image of images) {
						blocks.push({
							id: crypto.randomUUID(),
							todoId: todo.id,
							type: 'image',
							position: blocks.length,
							text: null,
							imageId: image.id
						});
						delete image.sortOrder;
						await imagesTable.put(image);
					}
					if (blocks.length) await blocksTable.bulkAdd(blocks);
				}
			});

		this.version(4).stores({
			todos: 'id, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, createdAt',
			todoBlocks: 'id, todoId, [todoId+position], type, imageId',
			imageMarkups: 'imageId, updatedAt'
		});

		this.version(5)
			.stores({
				todos: 'id, status, createdAt, updatedAt, deletedAt',
				todoImages: 'id, todoId, createdAt',
				todoBlocks: 'id, todoId, [todoId+position], type, imageId',
				imageMarkups: 'imageId, updatedAt'
			})
			.upgrade((transaction) =>
				transaction
					.table<LocalTodo>('todos')
					.toCollection()
					.modify((todo) => {
						todo.serverRevision = null;
						todo.localVersion = 1;
						todo.isDirty = true;
						todo.isPendingDelete = false;
						todo.hasSyncConflict = false;
					})
			);

		this.version(6)
			.stores({
				todos: 'id, status, createdAt, updatedAt, deletedAt',
				todoImages: 'id, todoId, createdAt',
				todoBlocks: 'id, todoId, [todoId+position], type, imageId',
				imageMarkups: 'imageId, updatedAt'
			})
			.upgrade((transaction) =>
				transaction
					.table<LocalTodoImage>('todoImages')
					.toCollection()
					.modify((image) => {
						image.storageKey = null;
					})
			);

		this.version(7)
			.stores({
				todos: 'id, ownerId, status, createdAt, updatedAt, deletedAt',
				todoImages: 'id, todoId, createdAt',
				todoBlocks: 'id, todoId, [todoId+position], type, imageId',
				imageMarkups: 'imageId, updatedAt'
			})
			.upgrade((transaction) =>
				transaction
					.table<LocalTodo>('todos')
					.toCollection()
					.modify((todo) => {
						todo.ownerId = null;
					})
			);

		this.version(8).stores({
			todos: 'id, ownerId, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, createdAt',
			todoBlocks: 'id, todoId, [todoId+position], type, imageId',
			imageMarkups: 'imageId, updatedAt',
			messages: 'id, todoId, [todoId+createdAt], authorId, type, isDirty',
			messageBlocks: 'id, messageId, [messageId+position], type, imageId',
			messageImages: 'id, messageId, createdAt',
			dialogReadStates: 'todoId, unreadCount, updatedAt'
		});
		this.version(9).stores({
			todos: 'id, ownerId, status, createdAt, updatedAt, deletedAt',
			todoImages: 'id, todoId, createdAt',
			todoBlocks: 'id, todoId, [todoId+position], type, imageId',
			imageMarkups: 'imageId, updatedAt',
			messages: 'id, todoId, [todoId+createdAt], authorId, type, isDirty',
			messageBlocks: 'id, messageId, [messageId+position], type, imageId',
			messageImages: 'id, messageId, createdAt',
			dialogReadStates: 'todoId, unreadCount, updatedAt',
			todoWorkers: 'id, &[todoId+userId], todoId, userId, state'
		});
	}
}

export function isTodoOwner(
	todo: Pick<LocalTodo, 'ownerId'>,
	currentUserId: string | null
): boolean {
	return currentUserId !== null && todo.ownerId === currentUserId;
}

export const todoDb = new QuickTodoDatabase();
