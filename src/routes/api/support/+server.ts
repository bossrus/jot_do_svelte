import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getAdminEmails } from '$lib/server/admin/auth';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { db } from '$lib/server/db';
import { supportRequests, users, type SupportRequestContent } from '$lib/server/db/schema';
import { sendSupportEmail, type SupportEmailAttachment } from '$lib/server/email';
import { ALLOWED_IMAGE_MIME_TYPES, readMaxImageSizeBytes } from '$lib/server/images/config';
import { notificationService } from '$lib/server/notifications/service';
import { createR2ObjectStorage } from '$lib/server/storage';

const storage = createR2ObjectStorage({
	R2_BUCKET: env.R2_BUCKET,
	R2_ENDPOINT: env.R2_ENDPOINT,
	R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
	R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY
});

const payloadSchema = z.object({
	blocks: z
		.array(
			z.discriminatedUnion('type', [
				z.object({ type: z.literal('text'), text: z.string().max(20_000) }),
				z.object({ type: z.literal('image'), imageId: z.uuid() })
			])
		)
		.min(1),
	images: z
		.array(
			z.object({
				id: z.uuid(),
				fileName: z.string().max(255).optional(),
				markup: z.array(z.record(z.string(), z.unknown())).max(500)
			})
		)
		.max(10)
});

export async function POST(event) {
	const reporter = requireAuthenticatedUser(event);
	const form = await event.request.formData();
	let rawPayload: unknown;
	try {
		rawPayload = JSON.parse(String(form.get('payload') ?? 'null'));
	} catch {
		return json({ message: 'Некорректное сообщение' }, { status: 400 });
	}
	const parsed = payloadSchema.safeParse(rawPayload);
	if (!parsed.success) return json({ message: 'Некорректное сообщение' }, { status: 400 });
	const imageById = new Map(parsed.data.images.map((image) => [image.id, image]));
	const maxSize = readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: env.MAX_IMAGE_SIZE_BYTES });
	const attachments: SupportEmailAttachment[] = [];
	const reportId = crypto.randomUUID();
	const storedImages: SupportRequestContent['images'] = [];
	const pendingUploads: Array<{ storageKey: string; content: Buffer; mimeType: string }> = [];
	const uploadedKeys: string[] = [];
	for (const [index, image] of parsed.data.images.entries()) {
		const file = form.get(`image:${image.id}`);
		if (
			!(file instanceof File) ||
			!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])
		)
			return json({ message: 'Некорректный формат изображения' }, { status: 415 });
		if (!file.size || file.size > maxSize)
			return json({ message: 'Изображение слишком большое' }, { status: 413 });
		const baseName = image.fileName || `screenshot-${index + 1}.${file.type.split('/')[1]}`;
		const content = Buffer.from(await file.arrayBuffer());
		attachments.push({
			filename: baseName,
			content,
			contentType: file.type
		});
		if (image.markup.length)
			attachments.push({
				filename: `${baseName}.markup.json`,
				content: Buffer.from(JSON.stringify(image.markup, null, 2)),
				contentType: 'application/json'
			});
		const storageKey = `users/${reporter.id}/support/${reportId}/${image.id}`;
		storedImages.push({
			id: image.id,
			storageKey,
			mimeType: file.type,
			fileName: baseName,
			markup: image.markup
		});
		pendingUploads.push({ storageKey, content, mimeType: file.type });
	}
	const message = parsed.data.blocks
		.map((block) =>
			block.type === 'text'
				? block.text.trim()
				: `[Скриншот: ${imageById.get(block.imageId)?.fileName ?? block.imageId}]`
		)
		.filter(Boolean)
		.join('\n\n');
	if (!message) return json({ message: 'Введите сообщение' }, { status: 400 });
	const adminEmails = getAdminEmails();
	if (!adminEmails.length) return json({ message: 'Техподдержка не настроена' }, { status: 503 });
	try {
		for (const image of pendingUploads) {
			await storage.put(image.storageKey, image.content, image.mimeType);
			uploadedKeys.push(image.storageKey);
		}
		await sendSupportEmail(
			adminEmails,
			{ name: reporter.name, email: reporter.email, publicId: reporter.publicId },
			message,
			attachments
		);
		await db.insert(supportRequests).values({
			id: reportId,
			userId: reporter.id,
			content: {
				blocks: parsed.data.blocks.map((block) => ({ ...block, id: crypto.randomUUID() })),
				images: storedImages
			}
		});
	} catch (error) {
		await Promise.allSettled(uploadedKeys.map((key) => storage.delete(key)));
		console.error('Support email delivery failed', error);
		return json({ code: 'SUPPORT_EMAIL_UNAVAILABLE' }, { status: 503 });
	}
	const admins = await db
		.select({ id: users.id })
		.from(users)
		.where(inArray(sql<string>`lower(${users.email})`, adminEmails));
	await Promise.all(
		admins.map((admin) =>
			notificationService.create({
				userId: admin.id,
				type: 'support.received',
				actorUserId: admin.id === reporter.id ? null : reporter.id,
				payload: { reporterName: reporter.name, reporterEmail: reporter.email },
				dedupeKey: `support:${reportId}:${admin.id}`
			})
		)
	);
	return json({ ok: true, recipients: adminEmails.length });
}
