import { describe, expect, it, vi } from 'vitest';
import { createStorageKey } from './keys.js';
import {
	DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS,
	isObjectNotFoundError,
	R2ObjectStorage,
	readR2Configuration
} from './r2.js';

const configuration = {
	bucket: 'test-bucket',
	endpoint: 'https://example.invalid',
	accessKeyId: 'access-key',
	secretAccessKey: 'secret-key'
};

describe('storage keys', () => {
	it('uses the requested namespace, a UUID, and extension', () => {
		expect(createStorageKey('/smoke-tests/', '.txt')).toMatch(
			/^smoke-tests\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/
		);
	});
});

describe('R2 configuration', () => {
	it('rejects missing values without including secret values', () => {
		expect(() => readR2Configuration({ R2_BUCKET: 'bucket' })).toThrow(
			'Invalid R2 configuration: missing R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY'
		);
	});

	it('returns a complete configuration', () => {
		expect(
			readR2Configuration({
				R2_BUCKET: ' bucket ',
				R2_ENDPOINT: ' endpoint ',
				R2_ACCESS_KEY_ID: ' access ',
				R2_SECRET_ACCESS_KEY: ' secret '
			})
		).toEqual({
			bucket: 'bucket',
			endpoint: 'endpoint',
			accessKeyId: 'access',
			secretAccessKey: 'secret'
		});
	});
});

describe('R2 errors', () => {
	it('normalizes only not-found responses', () => {
		expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
		expect(isObjectNotFoundError({ name: 'NoSuchKey' })).toBe(true);
		expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 500 } })).toBe(false);
	});
});

describe('presigned URLs', () => {
	it('uses a ten-minute default expiration for GET and PUT', async () => {
		const presign = vi.fn().mockResolvedValue('https://example.invalid/signed');
		const storage = new R2ObjectStorage(configuration, presign);

		await storage.createPresignedGetUrl('object');
		await storage.createPresignedPutUrl('object', 'text/plain');

		expect(presign).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything(), {
			expiresIn: DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS
		});
		expect(presign).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything(), {
			expiresIn: DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS
		});
	});
});
