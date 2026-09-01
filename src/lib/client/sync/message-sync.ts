import { todoDb, type LocalMessageImage } from '../db/database';
import { messageService } from '../db/message-service';
import type { StoredImageMarkup } from '../markup/types';
import { createImageTransferClient } from './image-transfer-client';
const transfer = createImageTransferClient();
type RemoteBlock =
	| { id: string; type: 'text'; position: number; text: string }
	| { id: string; type: 'image'; position: number; imageId: string };
type RemoteImage = Omit<LocalMessageImage, 'messageId' | 'blob' | 'createdAt'> & {
	markup: Omit<StoredImageMarkup, 'imageId' | 'updatedAt'> | null;
};
type RemoteMessage = {
	id: string;
	authorId: string | null;
	authorName: string;
	type: 'user' | 'system';
	eventType: string | null;
	createdAt: string;
	updatedAt: string;
	revision: number;
	blocks: RemoteBlock[];
	images: RemoteImage[];
};

export async function syncMessages(todoId: string) {
	const dirtyMessages = await todoDb.messages
		.where('todoId')
		.equals(todoId)
		.filter((message) => message.isDirty)
		.toArray();
	for (const message of dirtyMessages) {
		const full = await messageService.hydrate(message);
		for (const image of full.images) {
			const key = image.storageKey ?? (await transfer.upload(image));
			if (!image.storageKey) await todoDb.messageImages.update(image.id, { storageKey: key });
		}
		const images = await todoDb.messageImages.where('messageId').equals(message.id).toArray();
		const markups = new Map(
			await Promise.all(
				images.map(async (i) => [i.id, await todoDb.imageMarkups.get(i.id)] as const)
			)
		);
		const response = await fetch(`/api/sync/messages/${todoId}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: message.id,
				blocks: full.blocks.map((b, position) => ({ ...b, position })),
				images: images.map((i) => ({
					id: i.id,
					storageKey: i.storageKey,
					mimeType: i.mimeType,
					width: i.width,
					height: i.height,
					sizeBytes: i.sizeBytes,
					markup: markups.get(i.id) ? { version: 1, objects: markups.get(i.id)!.objects } : null
				}))
			})
		});
		if (response.ok) {
			const body = await response.json();
			await todoDb.messages.update(message.id, { isDirty: false, serverRevision: body.revision });
		}
	}
	const response = await fetch(`/api/sync/messages/${todoId}`);
	if (!response.ok) return;
	const body = (await response.json()) as {
		messages: RemoteMessage[];
		readUserMessagesCount: number;
		unreadCount: number;
	};
	for (const remote of body.messages) {
		const existing = await todoDb.messages.get(remote.id);
		if (existing?.isDirty) continue;
		const images: LocalMessageImage[] = [];
		for (const image of remote.images) {
			const local = await todoDb.messageImages.get(image.id);
			const blob =
				local && local.storageKey === image.storageKey
					? local.blob
					: await transfer.download(image);
			images.push({
				...image,
				messageId: remote.id,
				blob,
				createdAt: Date.parse(remote.createdAt)
			});
		}
		await todoDb.transaction(
			'rw',
			todoDb.messages,
			todoDb.messageBlocks,
			todoDb.messageImages,
			todoDb.imageMarkups,
			async () => {
				const previousImageIds = (await todoDb.messageImages
					.where('messageId')
					.equals(remote.id)
					.primaryKeys()) as string[];
				await todoDb.messages.put({
					id: remote.id,
					todoId,
					authorId: remote.authorId,
					authorName: remote.authorName,
					type: remote.type,
					eventType: remote.eventType,
					createdAt: Date.parse(remote.createdAt),
					updatedAt: Date.parse(remote.updatedAt),
					serverRevision: remote.revision,
					localVersion: existing?.localVersion ?? 1,
					isDirty: false
				});
				await todoDb.messageBlocks.where('messageId').equals(remote.id).delete();
				await todoDb.messageImages.where('messageId').equals(remote.id).delete();
				if (previousImageIds.length) await todoDb.imageMarkups.bulkDelete(previousImageIds);
				await todoDb.messageBlocks.bulkAdd(
					remote.blocks.map((b) => ({
						id: b.id,
						messageId: remote.id,
						type: b.type,
						position: b.position,
						text: b.type === 'text' ? b.text : null,
						imageId: b.type === 'image' ? b.imageId : null
					}))
				);
				if (images.length) await todoDb.messageImages.bulkAdd(images);
				for (const image of remote.images) {
					if (image.markup)
						await todoDb.imageMarkups.put({
							imageId: image.id,
							objects: image.markup.objects,
							version: 1,
							updatedAt: Date.now()
						});
				}
			}
		);
	}
	await todoDb.dialogReadStates.put({
		todoId,
		readUserMessagesCount: body.readUserMessagesCount,
		unreadCount: body.unreadCount,
		updatedAt: Date.now()
	});
}
