import { json } from '@sveltejs/kit';
import { prepareUploadRequestSchema } from '$lib/server/images/contracts';
import { getImageTransferService } from '$lib/server/images/image-transfer-service';
import { mapImageError, parseJson } from '$lib/server/images/http';
import { requireSyncUser } from '$lib/server/sync/http';

export async function POST(event) {
	const user = requireSyncUser(event);
	const body = await parseJson(event.request);
	if (body instanceof Response) return body;
	const parsed = prepareUploadRequestSchema.safeParse(body);
	if (!parsed.success)
		return json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues }, { status: 400 });
	try {
		return json(await getImageTransferService().prepare(user.id, parsed.data));
	} catch (cause) {
		return mapImageError(cause);
	}
}
