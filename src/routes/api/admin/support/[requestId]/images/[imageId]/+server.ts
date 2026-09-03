import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/admin/auth';
import { db } from '$lib/server/db';
import { supportRequests } from '$lib/server/db/schema';
import { createR2ObjectStorage } from '$lib/server/storage';

const storage = createR2ObjectStorage({
	R2_BUCKET: env.R2_BUCKET,
	R2_ENDPOINT: env.R2_ENDPOINT,
	R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
});

export async function GET(event) {
	requireAdmin(event);
	const request = (
		await db
			.select({ content: supportRequests.content })
			.from(supportRequests)
			.where(eq(supportRequests.id, event.params.requestId))
			.limit(1)
	)[0];
	const image = request?.content.images.find((item) => item.id === event.params.imageId);
	if (!image) error(404, 'Изображение не найдено');
	const data = await storage.get(image.storageKey);
	if (!data) error(404, 'Изображение не найдено');
	return new Response(Buffer.from(data), {
		headers: {
			'content-type': image.mimeType,
			'cache-control': 'private, max-age=3600'
		}
	});
}
