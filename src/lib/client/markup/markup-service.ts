import { todoDb, type QuickTodoDatabase } from '../db/database';
import { notifyLocalTodoMutation } from '../db/local-mutations';
import { cloneObjects } from './state';
import type { ImageMarkupObject, StoredImageMarkup } from './types';

export function createImageMarkupService(database: QuickTodoDatabase = todoDb) {
	return {
		async load(imageId: string): Promise<ImageMarkupObject[]> {
			return cloneObjects((await database.imageMarkups.get(imageId))?.objects ?? []);
		},
		async save(imageId: string, objects: ImageMarkupObject[]): Promise<void> {
			const record: StoredImageMarkup = {
				imageId,
				objects: cloneObjects(objects),
				version: 1,
				updatedAt: Date.now()
			};
			await database.transaction(
				'rw',
				database.imageMarkups,
				database.todoImages,
				database.messageImages,
				database.messages,
				database.todos,
				async () => {
					const image = await database.todoImages.get(imageId);
					if (image) {
						const todo = await database.todos.get(image.todoId);
						if (!todo || todo.isPendingDelete) throw new Error('Todo not found');
						await database.imageMarkups.put(record);
						await database.todos.put({
							...todo,
							updatedAt: record.updatedAt,
							isDirty: true,
							localVersion: todo.localVersion + 1
						});
						return;
					}
					const messageImage = await database.messageImages.get(imageId);
					if (!messageImage) throw new Error('Image not found');
					const message = await database.messages.get(messageImage.messageId);
					if (!message || message.type !== 'user') throw new Error('Message not found');
					await database.imageMarkups.put(record);
					await database.messages.put({
						...message,
						updatedAt: record.updatedAt,
						isDirty: true,
						localVersion: message.localVersion + 1
					});
				}
			);
			const image = await database.todoImages.get(imageId);
			if (image) notifyLocalTodoMutation(image.todoId);
			else {
				const messageImage = await database.messageImages.get(imageId);
				const message = messageImage
					? await database.messages.get(messageImage.messageId)
					: undefined;
				if (message) notifyLocalTodoMutation(message.todoId);
			}
		}
	};
}

export const imageMarkupService = createImageMarkupService();
