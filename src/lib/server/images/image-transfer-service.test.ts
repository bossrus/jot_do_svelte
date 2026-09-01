import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorage, StorageObjectMetadata } from '$lib/server/storage';
import { canonicalImageStorageKey, createImageTransferService } from './image-transfer-service';

function fakeStorage(metadata: StorageObjectMetadata | null = null): ObjectStorage {
	return {
		put: vi.fn(),
		get: vi.fn().mockResolvedValue(metadata ? new Uint8Array(metadata.size ?? 0) : null),
		delete: vi.fn(),
		exists: vi.fn(),
		getMetadata: vi.fn().mockResolvedValue(metadata),
		createPresignedGetUrl: vi.fn().mockResolvedValue('https://example.invalid/get'),
		createPresignedPutUrl: vi.fn().mockResolvedValue('https://example.invalid/put')
	};
}

const userId = randomUUID();
const imageId = randomUUID();
const storageKey = canonicalImageStorageKey(userId, imageId, 'image/png');

describe('image transfer service', () => {
	it('uploads an exact binary payload through the server fallback', async () => {
		const storage = fakeStorage();
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		const data = new Uint8Array([1, 2, 3]);
		await expect(
			service.upload(userId, { imageId, mimeType: 'image/png', sizeBytes: 3, data })
		).resolves.toMatchObject({ imageId, storageKey });
		expect(storage.put).toHaveBeenCalledWith(storageKey, data, 'image/png');
	});

	it('rejects a fallback payload whose actual size differs from metadata', async () => {
		const storage = fakeStorage();
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		await expect(
			service.upload(userId, {
				imageId,
				mimeType: 'image/png',
				sizeBytes: 3,
				data: new Uint8Array([1])
			})
		).rejects.toMatchObject({ code: 'UPLOAD_METADATA_MISMATCH' });
		expect(storage.put).not.toHaveBeenCalled();
	});
	it('prepares a canonical direct upload for each allowed MIME', async () => {
		for (const mimeType of ['image/jpeg', 'image/png', 'image/webp'] as const) {
			const storage = fakeStorage();
			const service = createImageTransferService({ storage, maxSizeBytes: 100 });
			const result = await service.prepare(userId, { imageId, mimeType, sizeBytes: 10 });
			expect(result.storageKey).toBe(canonicalImageStorageKey(userId, imageId, mimeType));
			expect(result.requiredHeaders).toEqual({ 'Content-Type': mimeType });
			expect(storage.createPresignedPutUrl).toHaveBeenCalledWith(result.storageKey, mimeType);
		}
	});

	it('returns a typed size error with the configured limit', async () => {
		const service = createImageTransferService({ storage: fakeStorage(), maxSizeBytes: 9 });
		await expect(
			service.prepare(userId, { imageId, mimeType: 'image/png', sizeBytes: 10 })
		).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', maxSizeBytes: 9 });
	});

	it('confirms real object metadata', async () => {
		const storage = fakeStorage({ key: storageKey, size: 10, contentType: 'image/png' });
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		expect(
			await service.confirm(userId, { imageId, storageKey, mimeType: 'image/png', sizeBytes: 10 })
		).toEqual({ imageId, storageKey, mimeType: 'image/png', sizeBytes: 10 });
	});

	it('does not inspect or delete an unowned key', async () => {
		const storage = fakeStorage();
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		await expect(
			service.confirm(userId, {
				imageId,
				storageKey: `users/${randomUUID()}/images/${imageId}.png`,
				mimeType: 'image/png',
				sizeBytes: 10
			})
		).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
		expect(storage.getMetadata).not.toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});

	it('cleans up an oversized actual object', async () => {
		const storage = fakeStorage({ key: storageKey, size: 101, contentType: 'image/png' });
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		await expect(
			service.confirm(userId, { imageId, storageKey, mimeType: 'image/png', sizeBytes: 10 })
		).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', maxSizeBytes: 100 });
		expect(storage.delete).toHaveBeenCalledWith(storageKey);
	});

	it('cleans up MIME and size mismatches', async () => {
		const storage = fakeStorage({ key: storageKey, size: 11, contentType: 'image/jpeg' });
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		await expect(
			service.confirm(userId, { imageId, storageKey, mimeType: 'image/png', sizeBytes: 10 })
		).rejects.toMatchObject({ code: 'UPLOAD_METADATA_MISMATCH' });
		expect(storage.delete).toHaveBeenCalledWith(storageKey);
	});

	it('reports a missing upload without cleanup', async () => {
		const storage = fakeStorage(null);
		const service = createImageTransferService({ storage, maxSizeBytes: 100 });
		await expect(
			service.confirm(userId, { imageId, storageKey, mimeType: 'image/png', sizeBytes: 10 })
		).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
		expect(storage.delete).not.toHaveBeenCalled();
	});
});
