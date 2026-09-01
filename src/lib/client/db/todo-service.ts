import { liveQuery } from 'dexie';
import { isTodoContentEmpty, normalizeBlocks, type TodoContentBlock } from '../content-blocks';
import { cloneObjects } from '../markup/state';
import type { ImageMarkupObject, StoredImageMarkup } from '../markup/types';
import {
	todoDb,
	type LocalTodo,
	type LocalTodoBlock,
	type LocalTodoImage,
	type LocalTodoWorker,
	type LocalTodoStatus,
	type LocalTodoWithImages,
	type QuickTodoDatabase
} from './database';
import { notifyLocalTodoMutation } from './local-mutations';

export type NewTodoImage = Omit<LocalTodoImage, 'todoId' | 'createdAt' | 'storageKey'> & {
	storageKey?: string | null;
	markup?: ImageMarkupObject[];
};
interface TodoServiceOptions {
	now?: () => number;
	createId?: () => string;
}

export interface ServerTodo {
	id: string;
	ownerId: string | null;
	ownerName?: string | null;
	status: LocalTodoStatus;
	revision: number;
	createdAt: number;
	updatedAt: number;
	closedAt: number | null;
	deletedAt: number | null;
	isAutomatic?: boolean;
	recurringTemplateId?: string | null;
	blocks: TodoContentBlock[];
	images: Array<
		LocalTodoImage & { markup: Omit<StoredImageMarkup, 'imageId' | 'updatedAt'> | null }
	>;
	workers: LocalTodoWorker[];
}

export function createTodoService(
	database: QuickTodoDatabase = todoDb,
	options: TodoServiceOptions = {}
) {
	async function purgeTodo(id: string): Promise<boolean> {
		return database.transaction(
			'rw',
			[
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				database.messages,
				database.messageBlocks,
				database.messageImages,
				database.dialogReadStates,
				database.todoWorkers
			],
			async () => {
				if (!(await database.todos.get(id))) return false;
				const todoImageIds = (await database.todoImages
					.where('todoId')
					.equals(id)
					.primaryKeys()) as string[];
				const messageIds = (await database.messages
					.where('todoId')
					.equals(id)
					.primaryKeys()) as string[];
				const messageImageIds = messageIds.length
					? ((await database.messageImages
							.where('messageId')
							.anyOf(messageIds)
							.primaryKeys()) as string[])
					: [];
				if (messageIds.length) {
					await database.messageBlocks.where('messageId').anyOf(messageIds).delete();
					await database.messageImages.where('messageId').anyOf(messageIds).delete();
				}
				await database.messages.where('todoId').equals(id).delete();
				await database.dialogReadStates.delete(id);
				await database.todoWorkers.where('todoId').equals(id).delete();
				await database.todoBlocks.where('todoId').equals(id).delete();
				await database.todoImages.where('todoId').equals(id).delete();
				if (todoImageIds.length) await database.imageMarkups.bulkDelete(todoImageIds);
				if (messageImageIds.length) await database.imageMarkups.bulkDelete(messageImageIds);
				await database.todos.delete(id);
				return true;
			}
		);
	}
	const now = options.now ?? Date.now;
	const createId = options.createId ?? (() => crypto.randomUUID());

	async function getVisibleTodo(id: string): Promise<LocalTodo> {
		const todo = await database.todos.get(id);
		if (!todo || todo.deletedAt !== null || todo.isPendingDelete) throw new Error('Todo not found');
		return todo;
	}

	function mutated(todo: LocalTodo, timestamp = now()): LocalTodo {
		return { ...todo, updatedAt: timestamp, isDirty: true, localVersion: todo.localVersion + 1 };
	}

	function blockRecords(todoId: string, blocks: TodoContentBlock[]): LocalTodoBlock[] {
		return blocks.map((block, position) => ({
			id: block.id,
			todoId,
			type: block.type,
			position,
			text: block.type === 'text' ? block.text : null,
			imageId: block.type === 'image' ? block.imageId : null
		}));
	}

	function imageRecords(
		todoId: string,
		images: NewTodoImage[],
		timestamp: number
	): LocalTodoImage[] {
		return images.map((image) => {
			const stored = { ...image };
			delete stored.markup;
			return {
				...stored,
				storageKey: image.storageKey ?? null,
				todoId,
				createdAt: timestamp
			};
		});
	}

	async function hydrate(todo: LocalTodo): Promise<LocalTodoWithImages> {
		const records = await database.todoBlocks.where('todoId').equals(todo.id).sortBy('position');
		const blocks: TodoContentBlock[] = [];
		for (const record of records) {
			if (record.type === 'text')
				blocks.push({ id: record.id, type: 'text', text: record.text ?? '' });
			else if (record.imageId)
				blocks.push({ id: record.id, type: 'image', imageId: record.imageId });
		}
		const images = await database.todoImages.where('todoId').equals(todo.id).toArray();
		let workers: LocalTodoWorker[] = [];
		try {
			workers = await database.todoWorkers.where('todoId').equals(todo.id).toArray();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'NotFoundError')) throw error;
		}
		return { ...todo, blocks, images, workers };
	}

	async function getTodos(status: LocalTodoStatus): Promise<LocalTodoWithImages[]> {
		const todos = (
			await database.todos
				.where('status')
				.equals(status)
				.filter((todo) => todo.deletedAt === null && !todo.isPendingDelete)
				.sortBy('createdAt')
		).reverse();
		return Promise.all(todos.map(hydrate));
	}

	async function replaceContent(
		todoId: string,
		blocks: TodoContentBlock[],
		images: NewTodoImage[],
		timestamp: number
	) {
		const normalized = normalizeBlocks(blocks);
		if (isTodoContentEmpty(normalized)) return null;
		const referencedIds = new Set(
			normalized.flatMap((block) => (block.type === 'image' ? [block.imageId] : []))
		);
		const referencedImages = images.filter((image) => referencedIds.has(image.id));
		if (referencedImages.length !== referencedIds.size)
			throw new Error('An image block has no image data');
		const previousImageIds = (await database.todoImages
			.where('todoId')
			.equals(todoId)
			.primaryKeys()) as string[];
		const removedImageIds = previousImageIds.filter((imageId) => !referencedIds.has(imageId));
		await database.todoBlocks.where('todoId').equals(todoId).delete();
		await database.todoImages.where('todoId').equals(todoId).delete();
		if (removedImageIds.length) await database.imageMarkups.bulkDelete(removedImageIds);
		const records = blockRecords(todoId, normalized);
		const storedImages = imageRecords(todoId, referencedImages, timestamp);
		if (records.length) await database.todoBlocks.bulkAdd(records);
		if (storedImages.length) await database.todoImages.bulkAdd(storedImages);
		const draftMarkups = referencedImages.flatMap((image) =>
			image.markup && image.markup.length
				? [
						{
							imageId: image.id,
							objects: cloneObjects(image.markup),
							version: 1 as const,
							updatedAt: timestamp
						}
					]
				: []
		);
		if (draftMarkups.length) await database.imageMarkups.bulkPut(draftMarkups);
		return { normalized, storedImages };
	}

	return {
		async getTodoForSync(id: string): Promise<LocalTodoWithImages | undefined> {
			const todo = await database.todos.get(id);
			return todo ? hydrate(todo) : undefined;
		},
		async getImageMarkup(imageId: string) {
			return database.imageMarkups.get(imageId);
		},
		async saveConfirmedStorageKey(imageId: string, storageKey: string): Promise<boolean> {
			return database.transaction('rw', database.todoImages, async () => {
				const image = await database.todoImages.get(imageId);
				if (!image) return false;
				await database.todoImages.update(imageId, { storageKey });
				return true;
			});
		},
		async saveImageDimensions(imageId: string, width: number, height: number): Promise<boolean> {
			if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0)
				throw new Error('Image dimensions must be positive integers');
			return database.transaction('rw', database.todoImages, async () => {
				const image = await database.todoImages.get(imageId);
				if (!image) return false;
				await database.todoImages.update(imageId, { width, height });
				return true;
			});
		},
		async getTodosForSync(): Promise<LocalTodoWithImages[]> {
			return Promise.all((await database.todos.orderBy('id').toArray()).map(hydrate));
		},
		async createTodo(
			blocks: TodoContentBlock[],
			images: NewTodoImage[] = [],
			ownerId: string | null = null
		): Promise<LocalTodoWithImages | null> {
			if (isTodoContentEmpty(blocks)) return null;
			const timestamp = now();
			const todo: LocalTodo = {
				id: createId(),
				ownerId,
				status: 'active',
				createdAt: timestamp,
				updatedAt: timestamp,
				closedAt: null,
				deletedAt: null,
				serverRevision: null,
				localVersion: 1,
				isDirty: true,
				isPendingDelete: false,
				hasSyncConflict: false
			};
			const created = await database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				async () => {
					await database.todos.add(todo);
					const content = await replaceContent(todo.id, blocks, images, timestamp);
					if (!content) throw new Error('Todo cannot be empty');
					return { ...todo, blocks: content.normalized, images: content.storedImages, workers: [] };
				}
			);
			notifyLocalTodoMutation(created.id);
			return created;
		},

		async updateTodo(
			id: string,
			blocks: TodoContentBlock[],
			images: NewTodoImage[]
		): Promise<LocalTodoWithImages | null> {
			if (isTodoContentEmpty(blocks)) return null;
			const updated = await database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				async () => {
					const todo = await getVisibleTodo(id);
					const timestamp = now();
					const content = await replaceContent(id, blocks, images, timestamp);
					if (!content) return null;
					const updated = mutated({ ...todo, text: undefined }, timestamp);
					await database.todos.put(updated);
					return {
						...updated,
						blocks: content.normalized,
						images: content.storedImages,
						workers: []
					};
				}
			);
			if (updated) notifyLocalTodoMutation(id);
			return updated;
		},

		async closeTodo(id: string): Promise<LocalTodo> {
			const updated = await database.transaction('rw', database.todos, async () => {
				const todo = await getVisibleTodo(id);
				const timestamp = now();
				const updated = mutated(
					{
						...todo,
						status: 'closed' as const,
						closedAt: timestamp
					},
					timestamp
				);
				await database.todos.put(updated);
				return updated;
			});
			notifyLocalTodoMutation(id);
			return updated;
		},
		async reopenTodo(id: string): Promise<LocalTodo> {
			const updated = await database.transaction('rw', database.todos, async () => {
				const todo = await getVisibleTodo(id);
				const updated = mutated({ ...todo, status: 'active' as const, closedAt: null });
				await database.todos.put(updated);
				return updated;
			});
			notifyLocalTodoMutation(id);
			return updated;
		},
		async deleteTodo(id: string): Promise<LocalTodo | undefined> {
			const deleted = await database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				async () => {
					const todo = await getVisibleTodo(id);
					if (todo.status !== 'closed') throw new Error('Only closed todos can be deleted');
					const timestamp = now();
					if (todo.serverRevision !== null) {
						const updated = mutated(
							{ ...todo, deletedAt: timestamp, isPendingDelete: true },
							timestamp
						);
						await database.todos.put(updated);
						return updated;
					}
					const imageIds = (await database.todoImages
						.where('todoId')
						.equals(id)
						.primaryKeys()) as string[];
					await database.todoBlocks.where('todoId').equals(id).delete();
					await database.todoImages.where('todoId').equals(id).delete();
					if (imageIds.length) await database.imageMarkups.bulkDelete(imageIds);
					await database.todos.delete(id);
					return undefined;
				}
			);
			if (deleted) notifyLocalTodoMutation(id);
			return deleted;
		},
		async finalizeSyncedDelete(id: string, expectedLocalVersion?: number): Promise<boolean> {
			return database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				async () => {
					const todo = await database.todos.get(id);
					if (!todo?.isPendingDelete) throw new Error('Todo is not pending deletion');
					if (expectedLocalVersion !== undefined && todo.localVersion !== expectedLocalVersion)
						return false;
					const imageIds = (await database.todoImages
						.where('todoId')
						.equals(id)
						.primaryKeys()) as string[];
					await database.todoBlocks.where('todoId').equals(id).delete();
					await database.todoImages.where('todoId').equals(id).delete();
					if (imageIds.length) await database.imageMarkups.bulkDelete(imageIds);
					await database.todos.delete(id);
					return true;
				}
			);
		},
		async removeServerDeletedTodo(id: string, expectedLocalVersion: number): Promise<boolean> {
			return database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				async () => {
					const todo = await database.todos.get(id);
					if (!todo || todo.localVersion !== expectedLocalVersion) return false;
					if (todo.isDirty || todo.isPendingDelete || todo.hasSyncConflict) return false;
					const imageIds = (await database.todoImages
						.where('todoId')
						.equals(id)
						.primaryKeys()) as string[];
					await database.todoBlocks.where('todoId').equals(id).delete();
					await database.todoImages.where('todoId').equals(id).delete();
					if (imageIds.length) await database.imageMarkups.bulkDelete(imageIds);
					await database.todos.delete(id);
					return true;
				}
			);
		},
		async removeRevokedTodo(id: string): Promise<boolean> {
			return purgeTodo(id);
		},
		async removeInaccessibleSharedTodos(currentUserId: string, accessibleTodoIds: string[]) {
			const accessible = new Set(accessibleTodoIds);
			const stale = await database.todos
				.filter(
					(todo) =>
						todo.ownerId !== null && todo.ownerId !== currentUserId && !accessible.has(todo.id)
				)
				.primaryKeys();
			let removed = 0;
			for (const id of stale) if (await purgeTodo(id as string)) removed++;
			return removed;
		},
		async applyServerTodo(
			serverTodo: ServerTodo,
			expectedLocalVersion: number | null
		): Promise<'applied' | 'raced'> {
			return database.transaction(
				'rw',
				database.todos,
				database.todoBlocks,
				database.todoImages,
				database.imageMarkups,
				database.todoWorkers,
				async () => {
					const current = await database.todos.get(serverTodo.id);
					const versionMatches =
						expectedLocalVersion === null
							? !current
							: current?.localVersion === expectedLocalVersion;
					if (
						!versionMatches ||
						(current && (current.isDirty || current.isPendingDelete || current.hasSyncConflict))
					) {
						if (current) await database.todos.update(current.id, { hasSyncConflict: true });
						return 'raced';
					}
					const imageIds = (await database.todoImages
						.where('todoId')
						.equals(serverTodo.id)
						.primaryKeys()) as string[];
					await database.todoBlocks.where('todoId').equals(serverTodo.id).delete();
					await database.todoImages.where('todoId').equals(serverTodo.id).delete();
					if (imageIds.length) await database.imageMarkups.bulkDelete(imageIds);
					await database.todoWorkers.where('todoId').equals(serverTodo.id).delete();
					const localVersion = current?.localVersion ?? 1;
					await database.todos.put({
						id: serverTodo.id,
						ownerId: serverTodo.ownerId,
						ownerName: serverTodo.ownerName ?? null,
						status: serverTodo.status,
						createdAt: serverTodo.createdAt,
						updatedAt: serverTodo.updatedAt,
						closedAt: serverTodo.closedAt,
						deletedAt: serverTodo.deletedAt,
						isAutomatic: serverTodo.isAutomatic ?? false,
						recurringTemplateId: serverTodo.recurringTemplateId ?? null,
						serverRevision: serverTodo.revision,
						localVersion,
						isDirty: false,
						isPendingDelete: false,
						hasSyncConflict: false
					});
					const records = blockRecords(serverTodo.id, serverTodo.blocks);
					if (records.length) await database.todoBlocks.bulkAdd(records);
					if (serverTodo.images.length) {
						await database.todoImages.bulkAdd(
							serverTodo.images.map((image) => ({
								id: image.id,
								todoId: image.todoId,
								blob: image.blob,
								mimeType: image.mimeType,
								width: image.width,
								height: image.height,
								sizeBytes: image.sizeBytes,
								createdAt: image.createdAt,
								storageKey: image.storageKey,
								...(image.fileName ? { fileName: image.fileName } : {})
							}))
						);
						const markups = serverTodo.images.flatMap((image) =>
							image.markup
								? [
										{
											imageId: image.id,
											version: image.markup.version,
											objects: image.markup.objects,
											updatedAt: serverTodo.updatedAt
										}
									]
								: []
						);
						if (markups.length) await database.imageMarkups.bulkAdd(markups);
					}
					if (serverTodo.workers.length) await database.todoWorkers.bulkAdd(serverTodo.workers);
					return 'applied';
				}
			);
		},
		async markTodoSynced(input: {
			todoId: string;
			serverRevision: number;
			sentLocalVersion: number;
		}) {
			if (!Number.isInteger(input.serverRevision) || input.serverRevision <= 0)
				throw new Error('Server revision must be a positive integer');
			return database.transaction('rw', database.todos, async () => {
				const todo = await database.todos.get(input.todoId);
				if (!todo) throw new Error('Todo not found');
				const updated = {
					...todo,
					serverRevision: input.serverRevision,
					isDirty:
						!todo.isPendingDelete && todo.localVersion === input.sentLocalVersion
							? false
							: todo.isDirty,
					hasSyncConflict: false
				};
				await database.todos.put(updated);
				return updated;
			});
		},
		async applyServerOwner(
			todoId: string,
			ownerId: string,
			ownerName?: string | null
		): Promise<boolean> {
			return database.transaction('rw', database.todos, async () => {
				const todo = await database.todos.get(todoId);
				if (!todo) return false;
				if (todo.ownerId === ownerId && todo.ownerName === ownerName) return true;
				await database.todos.update(todoId, { ownerId, ownerName: ownerName ?? null });
				return true;
			});
		},
		async replaceWorkers(todoId: string, workers: LocalTodoWorker[]) {
			await database.transaction('rw', database.todoWorkers, async () => {
				await database.todoWorkers.where('todoId').equals(todoId).delete();
				if (workers.length) await database.todoWorkers.bulkAdd(workers);
			});
		},
		async markSyncConflict(id: string) {
			await database.todos.update(id, { hasSyncConflict: true });
		},
		async clearSyncConflict(id: string) {
			await database.todos.update(id, { hasSyncConflict: false });
		},
		getDirtyTodos: () => database.todos.filter((todo) => todo.isDirty).toArray(),
		getPendingDeletes: () => database.todos.filter((todo) => todo.isPendingDelete).toArray(),
		getConflictedTodos: () => database.todos.filter((todo) => todo.hasSyncConflict).toArray(),
		getActiveTodos: () => getTodos('active'),
		getClosedTodos: () => getTodos('closed'),
		observeTodos: (status: LocalTodoStatus) => liveQuery(() => getTodos(status))
	};
}

export const todoService = createTodoService();
