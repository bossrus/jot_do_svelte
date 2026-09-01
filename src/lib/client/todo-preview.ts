import type { TodoContentBlock } from './content-blocks';
import { m } from '$lib/paraglide/messages';

export function getTodoImageCount(blocks: TodoContentBlock[]): number {
	return blocks.filter((block) => block.type === 'image').length;
}

export function getTodoPreviewText(blocks: TodoContentBlock[]): string {
	const firstText = blocks.find((block) => block.type === 'text' && block.text.trim());
	if (firstText?.type === 'text') return firstText.text.trim();

	const imageCount = getTodoImageCount(blocks);
	if (imageCount === 1) return m.image();
	if (imageCount > 1) return m.image_count({ count: imageCount });
	return m.untitled_todo();
}

export function getTodoHoverText(blocks: TodoContentBlock[]): string {
	const text = blocks
		.filter((block) => block.type === 'text')
		.map((block) => block.text)
		.join('\n');
	const imageCount = getTodoImageCount(blocks);
	const imageSummary = imageCount ? m.image_count({ count: imageCount }) : '';
	return [text, imageSummary].filter(Boolean).join('\n\n');
}
