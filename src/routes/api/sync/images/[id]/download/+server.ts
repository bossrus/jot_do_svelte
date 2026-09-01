import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getImageTransferService } from '$lib/server/images/image-transfer-service';
import { mapImageError } from '$lib/server/images/http';
import { requireSyncUser } from '$lib/server/sync/http';

export async function GET(event) {
	const user = requireSyncUser(event);
	const id = z.uuid().safeParse(event.params.id);
	if (!id.success)
		return json({ code: 'VALIDATION_ERROR', issues: id.error.issues }, { status: 400 });
	try {
		if (event.url.searchParams.get('proxy') === '1') {
			const image = await getImageTransferService().downloadData(user.id, id.data);
			return new Response(new Blob([Uint8Array.from(image.data)], { type: image.mimeType }), {
				headers: {
					'content-type': image.mimeType,
					'content-length': String(image.sizeBytes),
					'cache-control': 'private, max-age=300'
				}
			});
		}
		return json(await getImageTransferService().download(user.id, id.data));
	} catch (cause) {
		return mapImageError(cause);
	}
}
