import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db as defaultDb } from '$lib/server/db';
import {
	contactGroupMembers,
	messageImages,
	messages,
	todoGroupAccess,
	todoImages,
	todos,
	todoUserAccess,
	users
} from '$lib/server/db/schema';
import {
	createR2ObjectStorage,
	DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS,
	type ObjectStorage
} from '$lib/server/storage';
import { IMAGE_EXTENSIONS, readMaxImageSizeBytes, type AllowedImageMimeType } from './config';
import type { ConfirmUploadInput, PrepareUploadInput } from './contracts';
import { ImageTransferError } from './errors';
import { hasPlanCapability } from '$lib/server/permissions/plans';

type Database = typeof defaultDb;

export function canonicalImageStorageKey(
	userId: string,
	imageId: string,
	mimeType: AllowedImageMimeType
): string {
	return `users/${userId}/images/${imageId}.${IMAGE_EXTENSIONS[mimeType]}`;
}

export function createImageTransferService(options?: {
	database?: Database;
	storage?: ObjectStorage;
	maxSizeBytes?: number;
}) {
	const database = options?.database ?? defaultDb;
	const maxSizeBytes =
		options?.maxSizeBytes ??
		readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: env.MAX_IMAGE_SIZE_BYTES });
	const storage =
		options?.storage ??
		createR2ObjectStorage({
			R2_BUCKET: env.R2_BUCKET,
			R2_ENDPOINT: env.R2_ENDPOINT,
			R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
			R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
		});

	function assertSize(sizeBytes: number) {
		if (sizeBytes > maxSizeBytes) throw new ImageTransferError('IMAGE_TOO_LARGE', maxSizeBytes);
	}

	async function findAccessibleImage(userId: string, imageId: string) {
		const [viewer] = await database
			.select({ plan: users.plan })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		const todoAccess = (owner: typeof todos.ownerId) =>
			viewer && hasPlanCapability(viewer.plan, 'canJoinSharedTodo')
				? or(
						eq(owner, userId),
						sql`exists (select 1 from ${todoUserAccess} where ${todoUserAccess.todoId} = ${todos.id} and ${todoUserAccess.userId} = ${userId})`,
						sql`exists (select 1 from ${todoGroupAccess} join ${contactGroupMembers} on ${contactGroupMembers.groupId} = ${todoGroupAccess.groupId} where ${todoGroupAccess.todoId} = ${todos.id} and ${contactGroupMembers.userId} = ${userId})`
					)
				: eq(owner, userId);
		let [image] = await database
			.select({
				imageId: todoImages.id,
				storageKey: todoImages.storageKey,
				mimeType: todoImages.mimeType,
				sizeBytes: todoImages.sizeBytes
			})
			.from(todoImages)
			.innerJoin(todos, eq(todoImages.todoId, todos.id))
			.where(and(eq(todoImages.id, imageId), todoAccess(todos.ownerId), isNull(todos.deletedAt)))
			.limit(1);
		if (!image) {
			[image] = await database
				.select({
					imageId: messageImages.id,
					storageKey: messageImages.storageKey,
					mimeType: messageImages.mimeType,
					sizeBytes: messageImages.sizeBytes
				})
				.from(messageImages)
				.innerJoin(messages, eq(messageImages.messageId, messages.id))
				.innerJoin(todos, eq(messages.todoId, todos.id))
				.where(
					and(eq(messageImages.id, imageId), todoAccess(todos.ownerId), isNull(todos.deletedAt))
				)
				.limit(1);
		}
		if (!image) throw new ImageTransferError('NOT_FOUND');
		return image;
	}

	return {
		async upload(userId: string, input: PrepareUploadInput & { data: Uint8Array }) {
			assertSize(input.sizeBytes);
			if (input.data.byteLength !== input.sizeBytes)
				throw new ImageTransferError('UPLOAD_METADATA_MISMATCH');
			const storageKey = canonicalImageStorageKey(userId, input.imageId, input.mimeType);
			await storage.put(storageKey, input.data, input.mimeType);
			return { imageId: input.imageId, storageKey };
		},

		async prepare(userId: string, input: PrepareUploadInput) {
			assertSize(input.sizeBytes);
			const storageKey = canonicalImageStorageKey(userId, input.imageId, input.mimeType);
			return {
				imageId: input.imageId,
				storageKey,
				uploadUrl: await storage.createPresignedPutUrl(storageKey, input.mimeType),
				expiresInSeconds: DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS,
				requiredHeaders: { 'Content-Type': input.mimeType }
			};
		},

		async confirm(userId: string, input: ConfirmUploadInput) {
			assertSize(input.sizeBytes);
			const expectedKey = canonicalImageStorageKey(userId, input.imageId, input.mimeType);
			if (input.storageKey !== expectedKey) throw new ImageTransferError('INVALID_STORAGE_KEY');
			const metadata = await storage.getMetadata(expectedKey);
			if (!metadata) throw new ImageTransferError('UPLOAD_NOT_FOUND');
			const oversized = metadata.size !== undefined && metadata.size > maxSizeBytes;
			const mismatch = metadata.size !== input.sizeBytes || metadata.contentType !== input.mimeType;
			if (oversized || mismatch) {
				try {
					await storage.delete(expectedKey);
				} catch {
					// Cleanup is best-effort; preserve the typed validation failure for the client.
				}
				if (oversized) throw new ImageTransferError('IMAGE_TOO_LARGE', maxSizeBytes);
				throw new ImageTransferError('UPLOAD_METADATA_MISMATCH');
			}
			// TODO: old R2 objects absent from todo_images can be garbage-collected in the future.
			return { ...input };
		},

		async download(userId: string, imageId: string) {
			const image = await findAccessibleImage(userId, imageId);
			if (!(await storage.getMetadata(image.storageKey)))
				throw new ImageTransferError('IMAGE_OBJECT_MISSING');
			return {
				imageId: image.imageId,
				downloadUrl: await storage.createPresignedGetUrl(image.storageKey),
				expiresInSeconds: DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS,
				mimeType: image.mimeType as AllowedImageMimeType,
				sizeBytes: image.sizeBytes
			};
		},

		async downloadData(userId: string, imageId: string) {
			const image = await findAccessibleImage(userId, imageId);
			const data = await storage.get(image.storageKey);
			if (!data) throw new ImageTransferError('IMAGE_OBJECT_MISSING');
			if (data.byteLength !== image.sizeBytes)
				throw new ImageTransferError('UPLOAD_METADATA_MISMATCH');
			return { data, mimeType: image.mimeType, sizeBytes: image.sizeBytes };
		}
	};
}

let service: ReturnType<typeof createImageTransferService> | undefined;
export function getImageTransferService() {
	return (service ??= createImageTransferService());
}
