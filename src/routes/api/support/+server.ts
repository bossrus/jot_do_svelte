import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getAdminEmails } from '$lib/server/admin/auth';
import { requireAuthenticatedUser } from '$lib/server/friends/http';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { sendSupportEmail, type SupportEmailAttachment } from '$lib/server/email';
import { ALLOWED_IMAGE_MIME_TYPES, readMaxImageSizeBytes } from '$lib/server/images/config';
import { notificationService } from '$lib/server/notifications/service';

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
	let rawPayload: unknown = null;
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
		attachments.push({
			filename: baseName,
			content: Buffer.from(await file.arrayBuffer()),
			contentType: file.type
		});
		if (image.markup.length)
			attachments.push({
				filename: `${baseName}.markup.json`,
				content: Buffer.from(JSON.stringify(image.markup, null, 2)),
				contentType: 'application/json'
			});
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
		await sendSupportEmail(
			adminEmails,
			{ name: reporter.name, email: reporter.email, publicId: reporter.publicId },
			message,
			attachments
		);
	} catch (error) {
		console.error('Support email delivery failed', error);
		return json({ code: 'SUPPORT_EMAIL_UNAVAILABLE' }, { status: 503 });
	}
	const admins = await db
		.select({ id: users.id })
		.from(users)
		.where(inArray(sql<string>`lower(${users.email})`, adminEmails));
	const reportId = crypto.randomUUID();
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
