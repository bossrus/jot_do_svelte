import { z } from 'zod';
import { authClient } from '../auth';
import { todoService, type createTodoService, type ServerTodo } from '../db/todo-service';
import { createImageTransferClient, ImageTransferError } from './image-transfer-client';
import { syncMessages } from './message-sync';

async function syncMessagesWithoutBreakingTodos(todoId: string) {
	try {
		await syncMessages(todoId);
	} catch (error) {
		console.warn('Chat synchronization was skipped', error);
	}
}

const dateSchema = z.union([z.iso.datetime(), z.number().finite()]).transform((value, context) => {
	const timestamp = typeof value === 'number' ? value : Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		context.addIssue({ code: 'custom', message: 'Invalid date' });
		return z.NEVER;
	}
	return timestamp;
});
const indexTodoSchema = z.object({
	id: z.uuid(),
	ownerId: z.uuid().optional(),
	ownerName: z.string().nullable().optional(),
	revision: z.int().positive(),
	status: z.enum(['active', 'closed']),
	createdAt: dateSchema,
	updatedAt: dateSchema,
	deletedAt: dateSchema.nullable(),
	isAutomatic: z.boolean().optional(),
	recurringTemplateId: z.uuid().nullable().optional()
});
const blockSchema = z.discriminatedUnion('type', [
	z.object({
		id: z.uuid(),
		type: z.literal('text'),
		position: z.int().nonnegative(),
		text: z.string()
	}),
	z.object({
		id: z.uuid(),
		type: z.literal('image'),
		position: z.int().nonnegative(),
		imageId: z.uuid()
	})
]);
const transform = z.object({
	x: z.number(),
	y: z.number(),
	scale: z.number(),
	rotation: z.number()
});
const bounds = z.object({ width: z.number(), height: z.number() });
const markupObject = z.discriminatedUnion('type', [
	z.object({
		id: z.string(),
		type: z.literal('path'),
		transform,
		points: z.array(z.object({ x: z.number(), y: z.number() })),
		bounds,
		color: z.string(),
		width: z.number()
	}),
	z.object({
		id: z.string(),
		type: z.literal('text'),
		transform,
		text: z.string(),
		bounds,
		color: z.string()
	})
]);
const imageSchema = z.object({
	id: z.uuid(),
	storageKey: z.string().min(1),
	mimeType: z.string().min(1),
	width: z.int().positive(),
	height: z.int().positive(),
	sizeBytes: z.int().positive(),
	markup: z.object({ version: z.literal(1), objects: z.array(markupObject) }).nullable()
});
const todoSchema = z.object({
	id: z.uuid(),
	ownerId: z.uuid().optional(),
	ownerName: z.string().nullable().optional(),
	status: z.enum(['active', 'closed']),
	revision: z.int().positive(),
	createdAt: dateSchema,
	updatedAt: dateSchema,
	closedAt: dateSchema.nullable(),
	deletedAt: dateSchema.nullable(),
	isAutomatic: z.boolean().optional(),
	recurringTemplateId: z.uuid().nullable().optional(),
	workers: z
		.array(
			z.object({
				userId: z.uuid(),
				name: z.string(),
				state: z.enum(['doing', 'done']),
				startedAt: dateSchema,
				finishedAt: dateSchema.nullable()
			})
		)
		.default([]),
	blocks: z.array(blockSchema),
	images: z.array(imageSchema)
});
const currentIndexSchema = z.strictObject({
	todos: z.array(indexTodoSchema),
	revokedTodoIds: z.array(z.uuid()),
	fullTodos: z.array(todoSchema).optional()
});
const indexSchema = z
	.union([currentIndexSchema, z.array(indexTodoSchema)])
	.transform((value) => (Array.isArray(value) ? { todos: value, revokedTodoIds: [] } : value));
const putResponse = z.object({ revision: z.int().positive(), created: z.boolean() });
const deleteResponse = z.object({ revision: z.int().positive(), deletedAt: dateSchema });

export type SyncItemError = {
	todoId?: string;
	imageId?: string;
	operation:
		| 'auth'
		| 'push-create'
		| 'push-update'
		| 'push-delete'
		| 'image-upload'
		| 'pull-index'
		| 'pull-todo'
		| 'image-download';
	code: string;
	status?: number;
};
export type SyncResult = {
	status: 'success' | 'partial' | 'unauthenticated' | 'unauthorized' | 'forbidden' | 'failed';
	created: number;
	updated: number;
	deleted: number;
	pulled: number;
	conflicts: number;
	uploadedImages: number;
	downloadedImages: number;
	errors: SyncItemError[];
};
export type PullTodoResult = SyncResult;
type Repository = ReturnType<typeof createTodoService>;
type Options = {
	repository?: Repository;
	fetch?: typeof globalThis.fetch;
	hasAuthenticatedSession?: () => Promise<boolean>;
	getAuthenticatedUserId?: () => Promise<string | null>;
	readImageDimensions?: (blob: Blob) => Promise<{ width: number; height: number }>;
};

class GlobalSyncError extends Error {
	constructor(
		public state: 'unauthorized' | 'forbidden' | 'failed',
		public item: SyncItemError
	) {
		super(item.code);
	}
}
const emptyResult = (): SyncResult => ({
	status: 'success',
	created: 0,
	updated: 0,
	deleted: 0,
	pulled: 0,
	conflicts: 0,
	uploadedImages: 0,
	downloadedImages: 0,
	errors: []
});
async function authenticated() {
	const result = await authClient.getSession();
	return Boolean(result.data?.session && result.data.user);
}
async function authenticatedUserId() {
	const result = await authClient.getSession();
	return result.data?.user?.id ?? null;
}

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
	if (typeof createImageBitmap !== 'function') throw new Error('Image decoding is unavailable');
	const bitmap = await createImageBitmap(blob);
	try {
		return { width: bitmap.width, height: bitmap.height };
	} finally {
		bitmap.close();
	}
}

export function createSyncService(options: Options = {}) {
	const repository = options.repository ?? todoService;
	const fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);
	const transfers = createImageTransferClient({ fetch: fetchRequest });
	const resolveImageDimensions = options.readImageDimensions ?? readImageDimensions;
	async function request(
		url: string,
		init: RequestInit,
		item: Omit<SyncItemError, 'code' | 'status'>,
		signal?: AbortSignal
	) {
		let response: Response;
		try {
			response = await fetchRequest(url, { ...init, signal });
		} catch {
			throw new GlobalSyncError('failed', { ...item, code: 'NETWORK_ERROR' });
		}
		if (response.status === 401)
			throw new GlobalSyncError('unauthorized', { ...item, code: 'UNAUTHORIZED', status: 401 });
		if (response.status === 403) {
			let code = 'FORBIDDEN';
			try {
				const body = (await response.clone().json()) as { message?: string; code?: string };
				if (body.message === 'EMAIL_NOT_VERIFIED' || body.code === 'EMAIL_NOT_VERIFIED')
					code = 'EMAIL_NOT_VERIFIED';
				else if (body.message === 'PLAN_REQUIRED' || body.code === 'PLAN_REQUIRED')
					code = 'PLAN_REQUIRED';
			} catch {
				// Preserve the generic error for non-JSON responses.
			}
			throw new GlobalSyncError('forbidden', { ...item, code, status: 403 });
		}
		if (response.status >= 500)
			throw new GlobalSyncError('failed', {
				...item,
				code: 'SERVER_UNAVAILABLE',
				status: response.status
			});
		return response;
	}

	async function pullServerTodo(
		server: z.infer<typeof indexTodoSchema>,
		result: SyncResult,
		conflicts: Set<string>,
		signal?: AbortSignal,
		embeddedTodo?: z.infer<typeof todoSchema>
	) {
		signal?.throwIfAborted();
		const local = await repository.getTodoForSync(server.id);
		if (!local) {
			if (server.deletedAt !== null) return;
		} else {
			if (local.serverRevision !== null && server.revision < local.serverRevision) {
				await repository.markSyncConflict(local.id);
				conflicts.add(local.id);
				result.errors.push({
					todoId: local.id,
					operation: 'pull-todo',
					code: 'REVISION_REGRESSION'
				});
				return;
			}
			if (server.revision === local.serverRevision) {
				if (server.ownerId)
					await repository.applyServerOwner(local.id, server.ownerId, server.ownerName);
				if (
					local.isPendingDelete &&
					server.deletedAt !== null &&
					(await repository.finalizeSyncedDelete(local.id, local.localVersion))
				)
					result.deleted++;
				return;
			}
			if (local.isPendingDelete) {
				if (server.deletedAt !== null) {
					if (await repository.finalizeSyncedDelete(local.id, local.localVersion)) result.deleted++;
					return;
				}
				await repository.markSyncConflict(local.id);
				conflicts.add(local.id);
				return;
			}
			if (local.isDirty || local.hasSyncConflict) {
				await repository.markSyncConflict(local.id);
				conflicts.add(local.id);
				return;
			}
			if (server.deletedAt !== null) {
				if (await repository.removeServerDeletedTodo(local.id, local.localVersion))
					result.deleted++;
				else {
					await repository.markSyncConflict(local.id);
					conflicts.add(local.id);
				}
				return;
			}
		}
		const expectedVersion = local?.localVersion ?? null;
		let payload: unknown = embeddedTodo;
		if (!payload) {
			const response = await request(
				`/api/sync/todos/${encodeURIComponent(server.id)}`,
				{ method: 'GET' },
				{ todoId: server.id, operation: 'pull-todo' },
				signal
			);
			if (!response.ok) {
				result.errors.push({
					todoId: server.id,
					operation: 'pull-todo',
					code: 'HTTP_ERROR',
					status: response.status
				});
				return;
			}
			payload = await response.json();
		}
		const parsed = todoSchema.safeParse(payload);
		if (!parsed.success) {
			result.errors.push({
				todoId: server.id,
				operation: 'pull-todo',
				code: 'INVALID_RESPONSE'
			});
			return;
		}
		const localImages = new Map(local?.images.map((image) => [image.id, image]) ?? []);
		const images: ServerTodo['images'] = [];
		for (const image of parsed.data.images) {
			const existing = localImages.get(image.id);
			let blob =
				existing?.storageKey === image.storageKey && existing.blob instanceof Blob
					? existing.blob
					: null;
			if (!blob)
				try {
					blob = await transfers.download(image);
					signal?.throwIfAborted();
					result.downloadedImages++;
				} catch (cause) {
					const error =
						cause instanceof ImageTransferError
							? cause
							: new ImageTransferError('UNEXPECTED_ERROR');
					result.errors.push({
						todoId: server.id,
						imageId: image.id,
						operation: 'image-download',
						code: error.code,
						status: error.status
					});
					return;
				}
			images.push({ ...image, todoId: server.id, blob, createdAt: parsed.data.updatedAt });
		}
		signal?.throwIfAborted();
		const applied = await repository.applyServerTodo(
			{
				...parsed.data,
				workers: parsed.data.workers.map((worker) => ({
					...worker,
					id: `${server.id}:${worker.userId}`,
					todoId: server.id
				})),
				ownerId: parsed.data.ownerId ?? server.ownerId ?? local?.ownerId ?? null,
				blocks: parsed.data.blocks.map((block) =>
					block.type === 'text'
						? { id: block.id, type: block.type, text: block.text }
						: { id: block.id, type: block.type, imageId: block.imageId }
				),
				images
			},
			expectedVersion
		);
		if (applied === 'applied') result.pulled++;
		else conflicts.add(server.id);
	}

	async function pullTodoById(
		todoId: string,
		expectedServerRevision?: number,
		signal?: AbortSignal
	): Promise<PullTodoResult> {
		const result = emptyResult();
		const conflicts = new Set<string>();
		try {
			const local = await repository.getTodoForSync(todoId);
			if (
				expectedServerRevision !== undefined &&
				local?.serverRevision !== null &&
				local?.serverRevision !== undefined &&
				local.serverRevision >= expectedServerRevision
			)
				return result;
			const response = await request(
				'/api/sync/todos',
				{ method: 'GET' },
				{ todoId, operation: 'pull-index' },
				signal
			);
			if (!response.ok) {
				result.errors.push({
					todoId,
					operation: 'pull-index',
					code: 'HTTP_ERROR',
					status: response.status
				});
				result.status = 'partial';
				return result;
			}
			const index = indexSchema.safeParse(await response.json());
			if (!index.success)
				throw new GlobalSyncError('failed', {
					todoId,
					operation: 'pull-index',
					code: 'INVALID_SYNC_INDEX'
				});
			for (const revokedTodoId of index.data.revokedTodoIds)
				await repository.removeRevokedTodo(revokedTodoId);
			const server = index.data.todos.find((item) => item.id === todoId);
			if (!server) return result;
			await pullServerTodo(server, result, conflicts, signal);
		} catch (cause) {
			if (cause instanceof GlobalSyncError) {
				result.status = cause.state;
				result.errors.push(cause.item);
			} else {
				result.status = 'failed';
				result.errors.push({ todoId, operation: 'pull-todo', code: 'UNEXPECTED_ERROR' });
			}
		}
		if (result.status !== 'unauthorized' && result.status !== 'forbidden')
			await syncMessagesWithoutBreakingTodos(todoId);
		result.conflicts = conflicts.size;
		if (result.status === 'success' && (result.errors.length || result.conflicts))
			result.status = 'partial';
		return result;
	}

	async function pushTodoById(todoId: string, signal?: AbortSignal): Promise<SyncResult> {
		const result = emptyResult();
		try {
			if (!(await (options.hasAuthenticatedSession ?? authenticated)()))
				return { ...result, status: 'unauthenticated' };
			signal?.throwIfAborted();
			const snapshot = await repository.getTodoForSync(todoId);
			if (!snapshot || snapshot.hasSyncConflict) return result;
			if (!snapshot.isDirty && !snapshot.isPendingDelete) {
				await syncMessagesWithoutBreakingTodos(todoId);
				return result;
			}
			const sentLocalVersion = snapshot.localVersion;
			const operation = snapshot.isPendingDelete
				? 'push-delete'
				: snapshot.serverRevision === null
					? 'push-create'
					: 'push-update';
			if (!snapshot.isPendingDelete) {
				for (const image of snapshot.images) {
					try {
						let width = image.width;
						let height = image.height;
						if (
							!Number.isInteger(width) ||
							width! <= 0 ||
							!Number.isInteger(height) ||
							height! <= 0
						) {
							const dimensions = await resolveImageDimensions(image.blob);
							width = dimensions.width;
							height = dimensions.height;
							if (
								!Number.isInteger(width) ||
								width <= 0 ||
								!Number.isInteger(height) ||
								height <= 0
							)
								throw new ImageTransferError('IMAGE_DIMENSIONS_UNAVAILABLE');
							if (!(await repository.saveImageDimensions(image.id, width, height)))
								throw new ImageTransferError('LOCAL_IMAGE_MISSING');
						}
						const transferImage = {
							id: image.id,
							blob: image.blob,
							mimeType: image.mimeType,
							sizeBytes: image.sizeBytes
						};
						const key = image.storageKey
							? await transfers.confirm({ ...transferImage, storageKey: image.storageKey })
							: await transfers.upload(transferImage);
						signal?.throwIfAborted();
						await repository.saveConfirmedStorageKey(image.id, key);
						if (image.storageKey === null) result.uploadedImages++;
					} catch (cause) {
						const error =
							cause instanceof ImageTransferError
								? cause
								: new ImageTransferError('IMAGE_DIMENSIONS_UNAVAILABLE');
						result.errors.push({
							todoId,
							imageId: image.id,
							operation: 'image-upload',
							code: error.code,
							status: error.status
						});
						result.status = 'partial';
						return result;
					}
				}
			}
			const current = await repository.getTodoForSync(todoId);
			if (!current || current.localVersion !== sentLocalVersion) {
				result.errors.push({ todoId, operation, code: 'LOCAL_VERSION_CHANGED' });
				result.status = 'partial';
				return result;
			}
			const markups = new Map(
				await Promise.all(
					current.images.map(
						async (image) => [image.id, await repository.getImageMarkup(image.id)] as const
					)
				)
			);
			const response = await request(
				`/api/sync/todos/${encodeURIComponent(current.id)}`,
				{
					method: current.isPendingDelete ? 'DELETE' : 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(
						current.isPendingDelete
							? { baseRevision: current.serverRevision }
							: {
									id: current.id,
									baseRevision: current.serverRevision ?? 0,
									status: current.status,
									blocks: current.blocks.map((block, position) => ({ ...block, position })),
									images: current.images.map((image) => ({
										id: image.id,
										storageKey: image.storageKey,
										mimeType: image.mimeType,
										width: image.width,
										height: image.height,
										sizeBytes: image.sizeBytes,
										markup: markups.get(image.id)
											? { version: 1, objects: markups.get(image.id)!.objects }
											: null
									})),
									localUpdatedAt: current.updatedAt
								}
					)
				},
				{ todoId, operation },
				signal
			);
			signal?.throwIfAborted();
			if (response.status === 409) {
				await repository.markSyncConflict(todoId);
				result.conflicts = 1;
				result.status = 'partial';
				return result;
			}
			if (!response.ok) {
				result.errors.push({ todoId, operation, code: 'HTTP_ERROR', status: response.status });
				result.status = 'partial';
				return result;
			}
			if (current.isPendingDelete) {
				if (!deleteResponse.safeParse(await response.json()).success) {
					result.errors.push({ todoId, operation, code: 'INVALID_RESPONSE' });
					result.status = 'partial';
					return result;
				}
				if (await repository.finalizeSyncedDelete(todoId, sentLocalVersion)) result.deleted++;
				else {
					result.errors.push({ todoId, operation, code: 'LOCAL_VERSION_CHANGED' });
					result.status = 'partial';
				}
			} else {
				const parsed = putResponse.safeParse(await response.json());
				if (!parsed.success) {
					result.errors.push({ todoId, operation, code: 'INVALID_RESPONSE' });
					result.status = 'partial';
					return result;
				}
				await repository.markTodoSynced({
					todoId,
					serverRevision: parsed.data.revision,
					sentLocalVersion
				});
				if (operation === 'push-create') result.created++;
				else result.updated++;
			}
		} catch (cause) {
			if (cause instanceof GlobalSyncError) {
				result.status = cause.state;
				result.errors.push(cause.item);
			} else {
				result.status = 'failed';
				result.errors.push({ todoId, operation: 'push-update', code: 'UNEXPECTED_ERROR' });
			}
		}
		return result;
	}

	async function syncNow(signal?: AbortSignal): Promise<SyncResult> {
		const result = emptyResult();
		let currentUserId: string | null;
		const conflicts = new Set<string>();
		const racedDeletes = new Set<string>();
		try {
			if (!(await (options.hasAuthenticatedSession ?? authenticated)()))
				return { ...result, status: 'unauthenticated' };
			currentUserId = options.getAuthenticatedUserId
				? await options.getAuthenticatedUserId()
				: options.hasAuthenticatedSession
					? null
					: await authenticatedUserId();
		} catch {
			return {
				...result,
				status: 'failed',
				errors: [{ operation: 'auth', code: 'SESSION_ERROR' }]
			};
		}
		try {
			signal?.throwIfAborted();
			for (const snapshot of await repository.getTodosForSync()) {
				signal?.throwIfAborted();
				if (snapshot.hasSyncConflict || (!snapshot.isDirty && !snapshot.isPendingDelete)) continue;
				const pushed = await pushTodoById(snapshot.id, signal);
				result.created += pushed.created;
				result.updated += pushed.updated;
				result.deleted += pushed.deleted;
				result.uploadedImages += pushed.uploadedImages;
				result.errors.push(...pushed.errors);
				if (pushed.conflicts) conflicts.add(snapshot.id);
				if (
					pushed.errors.some(
						(error) => error.operation === 'push-delete' && error.code === 'LOCAL_VERSION_CHANGED'
					)
				)
					racedDeletes.add(snapshot.id);
				if (
					pushed.status === 'unauthorized' ||
					pushed.status === 'forbidden' ||
					pushed.status === 'failed'
				) {
					result.status = pushed.status;
					if (pushed.status !== 'failed') return { ...result, conflicts: conflicts.size };
				}
			}

			const indexResponse = await request(
				'/api/sync/todos',
				{ method: 'GET', headers: { 'x-sync-include-content': '1' } },
				{ operation: 'pull-index' },
				signal
			);
			if (!indexResponse.ok) {
				result.errors.push({
					operation: 'pull-index',
					code: 'HTTP_ERROR',
					status: indexResponse.status
				});
				result.status = 'partial';
				result.conflicts = conflicts.size;
				return result;
			}
			const index = indexSchema.safeParse(await indexResponse.json());
			if (!index.success)
				throw new GlobalSyncError('failed', {
					operation: 'pull-index',
					code: 'INVALID_SYNC_INDEX'
				});
			if (currentUserId)
				result.deleted += await repository.removeInaccessibleSharedTodos(
					currentUserId,
					index.data.todos.map((todo) => todo.id)
				);
			for (const revokedTodoId of index.data.revokedTodoIds)
				if (await repository.removeRevokedTodo(revokedTodoId)) result.deleted++;
			for (const server of index.data.todos) {
				if (racedDeletes.has(server.id)) continue;
				const embeddedTodo = index.data.fullTodos?.find((todo) => todo.id === server.id);
				await pullServerTodo(server, result, conflicts, signal, embeddedTodo);
			}
			// Chats are secondary data and should not hold the initial task list open.
			void Promise.all(index.data.todos.map((todo) => syncMessagesWithoutBreakingTodos(todo.id)));
		} catch (cause) {
			if (cause instanceof GlobalSyncError) {
				result.status = cause.state;
				result.errors.push(cause.item);
			} else {
				console.error('Unexpected initial synchronization error', cause);
				result.status = 'failed';
				result.errors.push({ operation: 'pull-index', code: 'UNEXPECTED_ERROR' });
			}
			result.conflicts = conflicts.size;
			return result;
		}
		result.conflicts = conflicts.size;
		if (result.errors.length || result.conflicts) result.status = 'partial';
		return result;
	}
	return { syncNow, pullTodoById, pushTodoById };
}
export const { syncNow, pullTodoById, pushTodoById } = createSyncService();
