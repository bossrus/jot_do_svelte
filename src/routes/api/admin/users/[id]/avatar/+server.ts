import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/admin/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { ALLOWED_IMAGE_MIME_TYPES, readMaxImageSizeBytes } from '$lib/server/images/config';
import { createR2ObjectStorage } from '$lib/server/storage';

const storage = createR2ObjectStorage({
	R2_BUCKET: env.R2_BUCKET,
	R2_ENDPOINT: env.R2_ENDPOINT,
	R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
});
const avatarKey = (userId: string) => `users/${userId}/avatar`;

async function target(id: string) {
	if (!z.uuid().safeParse(id).success) return undefined;
	return (
		await db
			.select({ id: users.id, publicId: users.publicId })
			.from(users)
			.where(eq(users.id, id))
			.limit(1)
	)[0];
}

export async function POST(event) {
	requireAdmin(event);
	const user = await target(event.params.id);
	if (!user) return json({ message: 'Пользователь не найден' }, { status: 404 });
	const mimeType = event.request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
	if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]))
		return json({ code: 'UNSUPPORTED_IMAGE_TYPE' }, { status: 415 });
	const maxSize = readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: env.MAX_IMAGE_SIZE_BYTES });
	const data = new Uint8Array(await event.request.arrayBuffer());
	if (!data.byteLength || data.byteLength > maxSize)
		return json(
			{ code: data.byteLength ? 'IMAGE_TOO_LARGE' : 'EMPTY_IMAGE', maxSize },
			{ status: 413 }
		);
	await storage.put(avatarKey(user.id), data, mimeType);
	const image = `/api/avatar/${encodeURIComponent(user.publicId)}?v=${Date.now()}`;
	await db.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, user.id));
	return json({ image });
}

export async function DELETE(event) {
	requireAdmin(event);
	const user = await target(event.params.id);
	if (!user) return json({ message: 'Пользователь не найден' }, { status: 404 });
	await storage.delete(avatarKey(user.id));
	await db.update(users).set({ image: null, updatedAt: new Date() }).where(eq(users.id, user.id));
	return new Response(null, { status: 204 });
}
