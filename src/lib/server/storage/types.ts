export type StorageObjectMetadata = {
	key: string;
	contentType?: string;
	size?: number;
	etag?: string;
};

export interface ObjectStorage {
	put(key: string, data: Uint8Array | Buffer, contentType: string): Promise<void>;
	get(key: string): Promise<Uint8Array | null>;
	delete(key: string): Promise<void>;
	exists(key: string): Promise<boolean>;
	getMetadata(key: string): Promise<StorageObjectMetadata | null>;
	createPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
	createPresignedPutUrl(
		key: string,
		contentType: string,
		expiresInSeconds?: number
	): Promise<string>;
}

export type R2Environment = {
	R2_BUCKET?: string;
	R2_ENDPOINT?: string;
	R2_ACCESS_KEY_ID?: string;
	R2_SECRET_ACCESS_KEY?: string;
};

export type R2Configuration = {
	bucket: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
};
