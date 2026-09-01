import { json } from '@sveltejs/kit';
import { ImageTransferError } from './errors';

export async function parseJson(request: Request): Promise<unknown | Response> {
	try {
		return await request.json();
	} catch {
		return json(
			{ code: 'VALIDATION_ERROR', issues: [{ message: 'Expected JSON body' }] },
			{ status: 400 }
		);
	}
}

export function mapImageError(cause: unknown): Response {
	if (!(cause instanceof ImageTransferError)) throw cause;
	if (cause.code === 'NOT_FOUND') return json({ code: cause.code }, { status: 404 });
	if (cause.code === 'IMAGE_OBJECT_MISSING') return json({ code: cause.code }, { status: 503 });
	if (cause.code === 'IMAGE_TOO_LARGE')
		return json({ code: cause.code, maxSizeBytes: cause.maxSizeBytes }, { status: 413 });
	if (cause.code === 'UPLOAD_NOT_FOUND') return json({ code: cause.code }, { status: 404 });
	return json({ code: cause.code }, { status: 400 });
}
