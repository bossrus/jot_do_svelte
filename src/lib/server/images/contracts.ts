import { z } from 'zod';
import { ALLOWED_IMAGE_MIME_TYPES } from './config';

const mimeType = z.enum(ALLOWED_IMAGE_MIME_TYPES);
const sizeBytes = z.int().positive().max(Number.MAX_SAFE_INTEGER);

export const prepareUploadRequestSchema = z.strictObject({
	imageId: z.uuid(),
	mimeType,
	sizeBytes
});
export const prepareUploadResponseSchema = z.strictObject({
	imageId: z.uuid(),
	storageKey: z.string(),
	uploadUrl: z.url(),
	expiresInSeconds: z.int().positive(),
	requiredHeaders: z.strictObject({ 'Content-Type': mimeType })
});
export const confirmUploadRequestSchema = z.strictObject({
	imageId: z.uuid(),
	storageKey: z.string().min(1).max(1024),
	mimeType,
	sizeBytes
});
export const confirmedImageSchema = z.strictObject({
	imageId: z.uuid(),
	storageKey: z.string(),
	mimeType,
	sizeBytes
});
export const downloadImageResponseSchema = confirmedImageSchema.omit({ storageKey: true }).extend({
	downloadUrl: z.url(),
	expiresInSeconds: z.int().positive()
});

export type PrepareUploadInput = z.infer<typeof prepareUploadRequestSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadRequestSchema>;
