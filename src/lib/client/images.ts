import type { NewTodoImage } from './db/todo-service';
import { m } from '$lib/paraglide/messages';

export const IMPORTABLE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isImportableImage(file: Pick<File, 'type'>): boolean {
	return IMPORTABLE_IMAGE_MIME_TYPES.includes(
		file.type as (typeof IMPORTABLE_IMAGE_MIME_TYPES)[number]
	);
}

export async function imageFromFile(file: File): Promise<NewTodoImage> {
	if (!isImportableImage(file))
		throw new Error(m.image_file_type_error({ name: file.name || m.file() }));

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
		markup: [],
		blob: file,
		mimeType: file.type,
		width,
		height,
		sizeBytes: file.size,
		...(file.name ? { fileName: file.name } : {})
	};
}
