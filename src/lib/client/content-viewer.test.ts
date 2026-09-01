import { describe, expect, it } from 'vitest';
import { visibleContentBlocks } from './content-viewer';

describe('visibleContentBlocks', () => {
	it('keeps the original text/image sequence and empty text blocks', () => {
		const blocks = [
			{ id: 'text-1', type: 'text' as const, text: 'Первая строка' },
			{ id: 'image-1-block', type: 'image' as const, imageId: 'image-1' },
			{ id: 'empty', type: 'text' as const, text: '' },
			{ id: 'missing-image', type: 'image' as const, imageId: 'missing' },
			{ id: 'text-2', type: 'text' as const, text: 'Последняя строка' }
		];

		expect(visibleContentBlocks(blocks, new Set(['image-1'])).map((block) => block.id)).toEqual([
			'text-1',
			'image-1-block',
			'empty',
			'text-2'
		]);
	});
});
