import type { NewTodoImage } from './db/todo-service';

export async function imageFromFile(file: File): Promise<NewTodoImage> {
	if (!file.type.startsWith('image/'))
		throw new Error(`${file.name || 'Файл'} не является изображением.`);

	let width: number | null = null;
	let height: number | null = null;
	try {
		const bitmap = await createImageBitmap(file);
		width = bitmap.width;
		height = bitmap.height;
		bitmap.close();
	} catch {
		// Metadata is optional; the original Blob is still usable.
	}

	return {
		id: crypto.randomUUID(),
		blob: file,
		mimeType: file.type,
		width,
		height,
		sizeBytes: file.size,
		...(file.name ? { fileName: file.name } : {})
	};
}
