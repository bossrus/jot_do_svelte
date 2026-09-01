import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { ALLOWED_IMAGE_MIME_TYPES, readMaxImageSizeBytes } from '$lib/server/images/config';
import { createR2ObjectStorage } from '$lib/server/storage';
import { requireAuthenticatedUser } from '$lib/server/friends/http';

const storage = createR2ObjectStorage({
	R2_BUCKET: env.R2_BUCKET,
	R2_ENDPOINT: env.R2_ENDPOINT,
	R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
});
const avatarKey = (userId: string) => `users/${userId}/avatar`;

export async function POST(event) {
	const user = requireAuthenticatedUser(event);
	const mimeType = event.request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]))
		return json({ code: 'UNSUPPORTED_IMAGE_TYPE' }, { status: 415 });
	const declaredSize = Number(event.request.headers.get('content-length'));
	const maxSize = readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: env.MAX_IMAGE_SIZE_BYTES });
	if (Number.isFinite(declaredSize) && declaredSize > maxSize)
		return json({ code: 'IMAGE_TOO_LARGE', maxSize }, { status: 413 });
	const data = new Uint8Array(await event.request.arrayBuffer());
	if (!data.byteLength || data.byteLength > maxSize)
		return json(
			{ code: data.byteLength ? 'IMAGE_TOO_LARGE' : 'EMPTY_IMAGE', maxSize },
			{ status: 413 }
		);
	await storage.put(avatarKey(user.id), data, mimeType);
	const image = `/api/avatar/${encodeURIComponent(user.publicId ?? user.id)}?v=${Date.now()}`;
	await db.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, user.id));
	return json({ image });
}

export async function DELETE(event) {
	const user = requireAuthenticatedUser(event);
	await storage.delete(avatarKey(user.id));
	await db.update(users).set({ image: null, updatedAt: new Date() }).where(eq(users.id, user.id));
	return new Response(null, { status: 204 });
}
