export type ImageErrorCode =
	| 'IMAGE_TOO_LARGE'
	| 'INVALID_STORAGE_KEY'
	| 'UPLOAD_NOT_FOUND'
	| 'UPLOAD_METADATA_MISMATCH'
	| 'NOT_FOUND'
	| 'IMAGE_OBJECT_MISSING';

export class ImageTransferError extends Error {
	constructor(
		public readonly code: ImageErrorCode,
		public readonly maxSizeBytes?: number
	) {
		super(code);
	}
}
