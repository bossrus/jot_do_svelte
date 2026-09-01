export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<AllowedImageMimeType, 'jpg' | 'png' | 'webp'> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export function readMaxImageSizeBytes(environment: { MAX_IMAGE_SIZE_BYTES?: string }): number {
	const raw = environment.MAX_IMAGE_SIZE_BYTES;
	if (!raw || !/^\d+$/.test(raw))
		throw new Error(
			'Invalid server configuration: MAX_IMAGE_SIZE_BYTES must be a positive integer'
		);
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new Error(
			'Invalid server configuration: MAX_IMAGE_SIZE_BYTES must be a positive safe integer'
		);
	return value;
}
