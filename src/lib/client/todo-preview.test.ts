import { describe, expect, it } from 'vitest';
import type { TodoContentBlock } from './content-blocks';
import { getTodoHoverText, getTodoImageCount, getTodoPreviewText } from './todo-preview';

const text = (id: string, value: string): TodoContentBlock => ({ id, type: 'text', text: value });
const image = (id: string): TodoContentBlock => ({ id, type: 'image', imageId: id });

describe('todo preview', () => {
	it('uses the first non-empty text block and skips empty leading lines', () => {
		expect(getTodoPreviewText([text('a', ''), text('b', '  '), text('c', ' First ')])).toBe(
			'First'
		);
	});

	it('uses an image fallback when there is no text', () => {
		expect(getTodoPreviewText([image('a')])).toBe('Image');
		expect(getTodoPreviewText([image('a'), image('b'), image('c')])).toBe('Images: 3');
	});

	it('counts image blocks', () => {
		expect(getTodoImageCount([text('a', 'one'), image('b'), text('c', 'two'), image('d')])).toBe(2);
	});

	it('collects every text block in order, preserves empty lines and omits images', () => {
		expect(
			getTodoHoverText([
				text('a', 'Первая'),
				image('photo-secret-name'),
				text('b', ''),
				text('c', 'Третья'),
				image('another-photo')
			])
		).toBe('Первая\n\nТретья\n\nImages: 2');
	});
});
