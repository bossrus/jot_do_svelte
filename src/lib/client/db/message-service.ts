import { liveQuery } from 'dexie';
import { normalizeBlocks, isTodoContentEmpty, type BlockContent } from '../content-blocks';
import {
	todoDb,
	type LocalMessage,
	type LocalMessageBlock,
	type LocalMessageImage
} from './database';
import type { NewTodoImage } from './todo-service';
import { notifyLocalTodoMutation } from './local-mutations';
import { cloneObjects } from '../markup/state';

export type LocalMessageWithContent = LocalMessage & {
	blocks: BlockContent[];
	images: LocalMessageImage[];
};
function blockRecords(messageId: string, blocks: BlockContent[]): LocalMessageBlock[] {
	return blocks.map((b, position) => ({
		id: b.id,
		messageId,
		type: b.type,
		position,
		text: b.type === 'text' ? b.text : null,
		imageId: b.type === 'image' ? b.imageId : null
	}));
}
async function hydrate(message: LocalMessage): Promise<LocalMessageWithContent> {
	const rows = await todoDb.messageBlocks.where('messageId').equals(message.id).sortBy('position');
	const blocks: BlockContent[] = [];
	for (const b of rows) {
		if (b.type === 'text') blocks.push({ id: b.id, type: 'text', text: b.text ?? '' });
		else if (b.imageId) blocks.push({ id: b.id, type: 'image', imageId: b.imageId });
	}
	const images = await todoDb.messageImages.where('messageId').equals(message.id).toArray();
	return { ...message, blocks, images };
}
export const messageService = {
	async create(
		todoId: string,
		authorId: string | null,
		authorName: string,
		blocks: BlockContent[],
		images: NewTodoImage[] = []
	) {
		const normalized = normalizeBlocks(blocks);
		if (isTodoContentEmpty(normalized)) return null;
		const timestamp = Date.now(),
			id = crypto.randomUUID();
		const referenced = new Set(normalized.flatMap((b) => (b.type === 'image' ? [b.imageId] : [])));
		const kept = images.filter((i) => referenced.has(i.id));
		if (kept.length !== referenced.size) throw new Error('An image block has no image data');
		const message: LocalMessage = {
			id,
			todoId,
			authorId,
			authorName,
			type: 'user',
			eventType: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			serverRevision: null,
			localVersion: 1,
			isDirty: true
		};
		await todoDb.transaction(
			'rw',
			todoDb.messages,
			todoDb.messageBlocks,
			todoDb.messageImages,
			todoDb.imageMarkups,
			async () => {
				await todoDb.messages.add(message);
				await todoDb.messageBlocks.bulkAdd(blockRecords(id, normalized));
				if (kept.length)
					await todoDb.messageImages.bulkAdd(
						kept.map((i) => ({
							id: i.id,
							messageId: id,
							blob: i.blob,
							mimeType: i.mimeType,
							width: i.width,
							height: i.height,
							sizeBytes: i.sizeBytes,
							fileName: i.fileName,
							storageKey: i.storageKey ?? null,
							createdAt: timestamp
						}))
					);
				for (const image of kept)
					if (image.markup?.length)
						await todoDb.imageMarkups.put({
							imageId: image.id,
							objects: cloneObjects(image.markup),
							version: 1,
							updatedAt: timestamp
						});
			}
		);
		notifyLocalTodoMutation(todoId);
		return hydrate(message);
	},
	list: async (todoId: string) =>
		Promise.all(
			(await todoDb.messages.where('todoId').equals(todoId).sortBy('createdAt')).map(hydrate)
		),
	observe: (todoId: string) => liveQuery(() => messageService.list(todoId)),
	async unread(todoId: string) {
		return (await todoDb.dialogReadStates.get(todoId))?.unreadCount ?? 0;
	},
	observeUnread: () =>
		liveQuery(
			async () =>
				new Map((await todoDb.dialogReadStates.toArray()).map((r) => [r.todoId, r.unreadCount]))
		),
	observeSearchText: () =>
		liveQuery(async () => {
			const messages = await todoDb.messages.toArray();
			const messageTodoIds = new Map(messages.map((message) => [message.id, message.todoId]));
			const result = new Map<string, string>();
			for (const block of await todoDb.messageBlocks.where('type').equals('text').toArray()) {
				const todoId = messageTodoIds.get(block.messageId);
				if (todoId) result.set(todoId, `${result.get(todoId) ?? ''} ${block.text ?? ''}`);
			}
			return result;
		}),
	async markRead(todoId: string) {
		const state = await todoDb.dialogReadStates.get(todoId);
		await todoDb.dialogReadStates.put({
			todoId,
			readUserMessagesCount: state?.readUserMessagesCount ?? 0,
			unreadCount: 0,
			updatedAt: Date.now()
		});
		try {
			const r = await fetch(`/api/sync/messages/${todoId}`, { method: 'POST' });
			if (r.ok) {
				const body = await r.json();
				await todoDb.dialogReadStates.update(todoId, {
					readUserMessagesCount: body.readUserMessagesCount,
					unreadCount: 0,
					updatedAt: Date.now()
				});
			}
		} catch {
			// Read receipts are best-effort and must not block local message hydration.
		}
	},
	hydrate
};
