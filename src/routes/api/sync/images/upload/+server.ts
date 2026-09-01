import { json } from '@sveltejs/kit';
import { prepareUploadRequestSchema } from '$lib/server/images/contracts';
import { getImageTransferService } from '$lib/server/images/image-transfer-service';
import { mapImageError } from '$lib/server/images/http';
import { requireSyncUser } from '$lib/server/sync/http';

export async function POST(event) {
	const user = requireSyncUser(event);
	const parsed = prepareUploadRequestSchema.safeParse({
		imageId: event.url.searchParams.get('imageId'),
		mimeType: event.request.headers.get('content-type'),
		sizeBytes: Number(event.url.searchParams.get('sizeBytes'))
	});
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		const data = new Uint8Array(await event.request.arrayBuffer());
		return json(await getImageTransferService().upload(user.id, { ...parsed.data, data }));
	} catch (cause) {
		return mapImageError(cause);
	}
}
