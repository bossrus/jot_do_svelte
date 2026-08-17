import { liveQuery } from 'dexie';
import {
	todoDb,
	type LocalTodo,
	type LocalTodoImage,
	type LocalTodoStatus,
	type LocalTodoWithImages,
	type QuickTodoDatabase
} from './database';

export type NewTodoImage = Omit<LocalTodoImage, 'todoId' | 'sortOrder' | 'createdAt'>;

interface TodoServiceOptions {
	now?: () => number;
	createId?: () => string;
}

function normalizeText(text: string): string {
	return text.trim();
}

export function createTodoService(
	database: QuickTodoDatabase = todoDb,
	options: TodoServiceOptions = {}
) {
	const now = options.now ?? Date.now;
	const createId = options.createId ?? (() => crypto.randomUUID());

	async function getVisibleTodo(id: string): Promise<LocalTodo> {
		const todo = await database.todos.get(id);

		if (!todo || todo.deletedAt !== null) {
			throw new Error('Todo not found');
		}

		return todo;
	}

	async function getTodos(status: LocalTodoStatus): Promise<LocalTodoWithImages[]> {
		const todos = await database.todos
			.where('status')
			.equals(status)
			.filter((todo) => todo.deletedAt === null)
			.sortBy('createdAt');

		const ordered = todos.reverse();
		if (ordered.length === 0) return [];
		const images = await database.todoImages.bulkGet(
			(
				await database.todoImages
					.where('todoId')
					.anyOf(ordered.map((todo) => todo.id))
					.sortBy('sortOrder')
			).map((image) => image.id)
		);
		return ordered.map((todo) => ({
			...todo,
			images: images.filter((image): image is LocalTodoImage => image?.todoId === todo.id)
		}));
	}

	function imageRecords(
		todoId: string,
		images: NewTodoImage[],
		timestamp: number
	): LocalTodoImage[] {
		return images.map((image, sortOrder) => ({
			...image,
			todoId,
			sortOrder,
			createdAt: timestamp
		}));
	}

	return {
		async createTodo(
			text: string,
			images: NewTodoImage[] = []
		): Promise<LocalTodoWithImages | null> {
			const normalizedText = normalizeText(text);

			if (!normalizedText && images.length === 0) return null;

			const timestamp = now();
			const todo: LocalTodo = {
				id: createId(),
				text: normalizedText,
				status: 'active',
				createdAt: timestamp,
				updatedAt: timestamp,
				closedAt: null,
				deletedAt: null
			};

			const records = imageRecords(todo.id, images, timestamp);
			await database.transaction('rw', database.todos, database.todoImages, async () => {
				await database.todos.add(todo);
				if (records.length) await database.todoImages.bulkAdd(records);
			});
			return { ...todo, images: records };
		},

		async updateTodo(
			id: string,
			text: string,
			images?: NewTodoImage[]
		): Promise<LocalTodoWithImages | null> {
			const normalizedText = normalizeText(text);
			return database.transaction('rw', database.todos, database.todoImages, async () => {
				const todo = await getVisibleTodo(id);
				const currentImages = await database.todoImages
					.where('todoId')
					.equals(id)
					.sortBy('sortOrder');
				const nextImages = images ?? currentImages;
				if (!normalizedText && nextImages.length === 0) return null;
				const updatedTodo = { ...todo, text: normalizedText, updatedAt: now() };
				await database.todos.put(updatedTodo);
				if (images) {
					await database.todoImages.where('todoId').equals(id).delete();
					const records = imageRecords(id, images, updatedTodo.updatedAt);
					if (records.length) await database.todoImages.bulkAdd(records);
					return { ...updatedTodo, images: records };
				}
				return { ...updatedTodo, images: currentImages };
			});
		},

		async deleteTodoImage(todoId: string, imageId: string): Promise<void> {
			await database.transaction('rw', database.todos, database.todoImages, async () => {
				const todo = await getVisibleTodo(todoId);
				const image = await database.todoImages.get(imageId);
				if (!image || image.todoId !== todoId) throw new Error('Image not found');
				await database.todoImages.delete(imageId);
				await database.todos.update(todo.id, { updatedAt: now() });
			});
		},

		async closeTodo(id: string): Promise<LocalTodo> {
			return database.transaction('rw', database.todos, database.todoImages, async () => {
				const todo = await getVisibleTodo(id);
				const timestamp = now();
				const updatedTodo: LocalTodo = {
					...todo,
					status: 'closed',
					closedAt: timestamp,
					updatedAt: timestamp
				};
				await database.todos.put(updatedTodo);
				return updatedTodo;
			});
		},

		async reopenTodo(id: string): Promise<LocalTodo> {
			return database.transaction('rw', database.todos, database.todoImages, async () => {
				const todo = await getVisibleTodo(id);
				const updatedTodo: LocalTodo = {
					...todo,
					status: 'active',
					closedAt: null,
					updatedAt: now()
				};
				await database.todos.put(updatedTodo);
				return updatedTodo;
			});
		},

		async deleteTodo(id: string): Promise<LocalTodo> {
			return database.transaction('rw', database.todos, database.todoImages, async () => {
				const todo = await getVisibleTodo(id);

				if (todo.status !== 'closed') {
					throw new Error('Only closed todos can be deleted');
				}

				const timestamp = now();
				const updatedTodo = { ...todo, deletedAt: timestamp, updatedAt: timestamp };
				await database.todos.put(updatedTodo);
				await database.todoImages.where('todoId').equals(id).delete();
				return updatedTodo;
			});
		},

		getActiveTodos: () => getTodos('active'),
		getClosedTodos: () => getTodos('closed'),
		observeTodos: (status: LocalTodoStatus) => liveQuery(() => getTodos(status))
	};
}

export const todoService = createTodoService();
