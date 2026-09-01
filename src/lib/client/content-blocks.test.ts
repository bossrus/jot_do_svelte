import { describe, expect, it } from 'vitest';
import {
	adjacentTextPosition,
	cloneBlocks,
	insertImageBlocks,
	insertTextLines,
	isTodoContentEmpty,
	moveBlock,
	normalizeBlocks,
	removeBlock,
	splitTextBlock,
	type TodoContentBlock
} from './content-blocks';

const ids = (...values: string[]) => {
	let index = 0;
	return () => values[index++];
};
const text = (id: string, value: string): TodoContentBlock => ({ id, type: 'text', text: value });
const image = (id: string, imageId = id): TodoContentBlock => ({ id, type: 'image', imageId });

describe('content block operations', () => {
	it('clones reactive-safe block values and navigates between nearest text blocks', () => {
		const blocks = [text('a', '12345'), image('i'), text('b', '12'), text('c', '123456')];
		const cloned = cloneBlocks(blocks);
		expect(cloned).toEqual(blocks);
		expect(cloned[0]).not.toBe(blocks[0]);
		expect(adjacentTextPosition(blocks, 'a', 1, 4)).toEqual({ focusId: 'b', focusOffset: 2 });
		expect(adjacentTextPosition(blocks, 'c', -1, 4)).toEqual({ focusId: 'b', focusOffset: 2 });
		expect(adjacentTextPosition(blocks, 'a', -1, 3)).toEqual({ focusId: 'a', focusOffset: 0 });
		expect(adjacentTextPosition(blocks, 'c', 1, 3)).toEqual({ focusId: 'c', focusOffset: 6 });
	});

	it('splits a text block at the cursor for Shift+Enter', () => {
		const result = splitTextBlock([text('a', 'до после')], 'a', 3, ids('b'));
		expect(result.blocks).toEqual([text('a', 'до '), text('b', 'после')]);
		expect(result.focusId).toBe('b');
	});

	it('turns multiline paste into text blocks and joins both surrounding parts', () => {
		const result = insertTextLines(
			[text('a', 'left right')],
			'a',
			5,
			6,
			'one\ntwo\nthree',
			ids('b', 'c')
		);
		expect(result.blocks).toEqual([
			text('a', 'left one'),
			text('b', 'two'),
			text('c', 'threeight')
		]);
		expect(result.focusOffset).toBe(5);
	});

	it('inserts image blocks inside a line and creates a following text block', () => {
		const result = insertImageBlocks([text('a', 'до после')], 'a', 3, ['img'], ids('ib', 'after'));
		expect(result.blocks).toEqual([text('a', 'до '), image('ib', 'img'), text('after', 'после')]);
		expect(result.focusId).toBe('after');
	});

	it('removes and reorders image blocks without changing other blocks', () => {
		const blocks = [text('a', 'one'), image('ia'), text('b', 'two'), image('ib')];
		expect(removeBlock(blocks, 'ia')).toEqual([text('a', 'one'), text('b', 'two'), image('ib')]);
		expect(moveBlock(blocks, 'ib', 1)).toEqual([
			text('a', 'one'),
			image('ib'),
			image('ia'),
			text('b', 'two')
		]);
	});

	it('normalizes only empty edge lines and detects meaningful content', () => {
		const blocks = [text('a', ''), text('b', 'one'), text('c', ''), image('i'), text('d', '')];
		expect(normalizeBlocks(blocks)).toEqual([text('b', 'one'), text('c', ''), image('i')]);
		expect(isTodoContentEmpty([text('a', ' \t')])).toBe(true);
		expect(isTodoContentEmpty([text('a', ''), image('i')])).toBe(false);
	});
});
