import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createR2ObjectStorage } from '$lib/server/storage';

const storage = createR2ObjectStorage({
	R2_BUCKET: env.R2_BUCKET,
	R2_ENDPOINT: env.R2_ENDPOINT,
	R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
});

export async function GET({ params }) {
	const [user] = await db
		.select({ id: users.id, image: users.image })
		.from(users)
		.where(eq(users.publicId, params.publicId))
		.limit(1);
	if (!user?.image) error(404, 'Avatar not found');
	const key = `users/${user.id}/avatar`;
	const [data, metadata] = await Promise.all([storage.get(key), storage.getMetadata(key)]);
	if (!data || !metadata?.contentType) error(404, 'Avatar not found');
	return new Response(new Blob([Uint8Array.from(data)], { type: metadata.contentType }), {
		headers: {
			'content-type': metadata.contentType,
			'content-length': String(data.byteLength),
			'cache-control': 'public, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
}
