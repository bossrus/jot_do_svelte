import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
	ObjectStorage,
	R2Configuration,
	R2Environment,
	StorageObjectMetadata
} from './types.js';

export const DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS = 600;

const requiredEnvironmentKeys = [
	'R2_BUCKET',
	'R2_ENDPOINT',
	'R2_ACCESS_KEY_ID',
	'R2_SECRET_ACCESS_KEY'
] as const;

export function hasR2Configuration(environment: R2Environment = process.env): boolean {
	return requiredEnvironmentKeys.every((key) => Boolean(environment[key]?.trim()));
}

export function readR2Configuration(environment: R2Environment): R2Configuration {
	const missing = requiredEnvironmentKeys.filter((key) => !environment[key]?.trim());

	if (missing.length > 0) {
		throw new Error(`Invalid R2 configuration: missing ${missing.join(', ')}`);
	}

	return {
		bucket: environment.R2_BUCKET!.trim(),
		endpoint: environment.R2_ENDPOINT!.trim(),
		accessKeyId: environment.R2_ACCESS_KEY_ID!.trim(),
		secretAccessKey: environment.R2_SECRET_ACCESS_KEY!.trim()
	};
}

export function isObjectNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	const candidate = error as {
		name?: string;
		Code?: string;
		$metadata?: { httpStatusCode?: number };
	};

	return (
		candidate.$metadata?.httpStatusCode === 404 ||
		candidate.name === 'NotFound' ||
		candidate.name === 'NoSuchKey' ||
		candidate.Code === 'NotFound' ||
		candidate.Code === 'NoSuchKey'
	);
}

type Presigner = typeof getSignedUrl;

export class R2ObjectStorage implements ObjectStorage {
	readonly #client: S3Client;
	readonly #bucket: string;
	readonly #presign: Presigner;

	constructor(configuration: R2Configuration, presign: Presigner = getSignedUrl) {
		this.#bucket = configuration.bucket;
		this.#presign = presign;
		this.#client = new S3Client({
			endpoint: configuration.endpoint,
			region: 'auto',
			credentials: {
				accessKeyId: configuration.accessKeyId,
				secretAccessKey: configuration.secretAccessKey
			}
		});
	}

	async put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<void> {
		await this.#client.send(
			new PutObjectCommand({ Bucket: this.#bucket, Key: key, Body: data, ContentType: contentType })
		);
	}

	async get(key: string): Promise<Uint8Array | null> {
		try {
			const result = await this.#client.send(
				new GetObjectCommand({ Bucket: this.#bucket, Key: key })
			);
			return result.Body ? result.Body.transformToByteArray() : new Uint8Array();
		} catch (error) {
			if (isObjectNotFoundError(error)) return null;
			throw error;
		}
	}

	async delete(key: string): Promise<void> {
		await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
	}

	async exists(key: string): Promise<boolean> {
		return (await this.getMetadata(key)) !== null;
	}

	async getMetadata(key: string): Promise<StorageObjectMetadata | null> {
		try {
			const result = await this.#client.send(
				new HeadObjectCommand({ Bucket: this.#bucket, Key: key })
			);

			return {
				key,
				...(result.ContentType === undefined ? {} : { contentType: result.ContentType }),
				...(result.ContentLength === undefined ? {} : { size: result.ContentLength }),
				...(result.ETag === undefined ? {} : { etag: result.ETag })
			};
		} catch (error) {
			if (isObjectNotFoundError(error)) return null;
			throw error;
		}
	}

	async createPresignedGetUrl(
		key: string,
		expiresInSeconds = DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS
	): Promise<string> {
		return this.#presign(this.#client, new GetObjectCommand({ Bucket: this.#bucket, Key: key }), {
			expiresIn: expiresInSeconds
		});
	}

	async createPresignedPutUrl(
		key: string,
		contentType: string,
		expiresInSeconds = DEFAULT_PRESIGNED_URL_EXPIRATION_SECONDS
	): Promise<string> {
		return this.#presign(
			this.#client,
			new PutObjectCommand({ Bucket: this.#bucket, Key: key, ContentType: contentType }),
			{ expiresIn: expiresInSeconds }
		);
	}
}

export function createR2ObjectStorage(environment: R2Environment = process.env): R2ObjectStorage {
	return new R2ObjectStorage(readR2Configuration(environment));
}
