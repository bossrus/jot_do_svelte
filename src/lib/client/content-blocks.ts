export type TextBlock = { id: string; type: 'text'; text: string };
export type ImageBlock = { id: string; type: 'image'; imageId: string };
export type BlockContent = TextBlock | ImageBlock;
/** @deprecated Prefer BlockContent for content shared by todos and messages. */
export type TodoContentBlock = BlockContent;

const defaultId: () => string = () => crypto.randomUUID();

export function emptyContent(createId = defaultId): TextBlock[] {
	return [{ id: createId(), type: 'text', text: '' }];
}

export function cloneBlocks(blocks: TodoContentBlock[]): TodoContentBlock[] {
	return blocks.map((block) => ({ ...block }));
}

export function adjacentTextPosition(
	blocks: TodoContentBlock[],
	blockId: string,
	direction: -1 | 1,
	offset: number
): { focusId: string; focusOffset: number } {
	const currentIndex = blocks.findIndex((block) => block.id === blockId && block.type === 'text');
	if (currentIndex < 0) return { focusId: blockId, focusOffset: offset };
	for (
		let index = currentIndex + direction;
		index >= 0 && index < blocks.length;
		index += direction
	) {
		const block = blocks[index];
		if (block.type === 'text') {
			return { focusId: block.id, focusOffset: Math.min(offset, block.text.length) };
		}
	}
	const current = blocks[currentIndex] as TextBlock;
	return { focusId: current.id, focusOffset: direction === -1 ? 0 : current.text.length };
}

export function splitTextBlock(
	blocks: TodoContentBlock[],
	blockId: string,
	offset: number,
	createId = defaultId
): { blocks: TodoContentBlock[]; focusId: string; focusOffset: number } {
	const index = blocks.findIndex((block) => block.id === blockId && block.type === 'text');
	if (index < 0) return { blocks, focusId: blockId, focusOffset: offset };
	const current = blocks[index] as TextBlock;
	const safeOffset = Math.max(0, Math.min(offset, current.text.length));
	const next: TextBlock = { id: createId(), type: 'text', text: current.text.slice(safeOffset) };
	return {
		blocks: [
			...blocks.slice(0, index),
			{ ...current, text: current.text.slice(0, safeOffset) },
			next,
			...blocks.slice(index + 1)
		],
		focusId: next.id,
		focusOffset: 0
	};
}

export function insertTextLines(
	blocks: TodoContentBlock[],
	blockId: string,
	start: number,
	end: number,
	value: string,
	createId = defaultId
): { blocks: TodoContentBlock[]; focusId: string; focusOffset: number } {
	const index = blocks.findIndex((block) => block.id === blockId && block.type === 'text');
	if (index < 0) return { blocks, focusId: blockId, focusOffset: start };
	const current = blocks[index] as TextBlock;
	const left = current.text.slice(0, start);
	const right = current.text.slice(end);
	const lines = value.replace(/\r\n?/g, '\n').split('\n');
	if (lines.length === 1) {
		const text = left + lines[0] + right;
		return {
			blocks: [...blocks.slice(0, index), { ...current, text }, ...blocks.slice(index + 1)],
			focusId: current.id,
			focusOffset: left.length + lines[0].length
		};
	}
	const inserted: TextBlock[] = lines.map((line, lineIndex) => ({
		id: lineIndex === 0 ? current.id : createId(),
		type: 'text',
		text: `${lineIndex === 0 ? left : ''}${line}${lineIndex === lines.length - 1 ? right : ''}`
	}));
	const last = inserted.at(-1)!;
	return {
		blocks: [...blocks.slice(0, index), ...inserted, ...blocks.slice(index + 1)],
		focusId: last.id,
		focusOffset: lines.at(-1)!.length
	};
}

export function insertImageBlocks(
	blocks: TodoContentBlock[],
	blockId: string | null,
	offset: number,
	imageIds: string[],
	createId = defaultId
): { blocks: TodoContentBlock[]; focusId: string; focusOffset: number } {
	const imageBlocks: ImageBlock[] = imageIds.map((imageId) => ({
		id: createId(),
		type: 'image',
		imageId
	}));
	if (!imageBlocks.length) return { blocks, focusId: blockId ?? '', focusOffset: offset };
	const index = blocks.findIndex((block) => block.id === blockId && block.type === 'text');
	if (index >= 0) {
		const current = blocks[index] as TextBlock;
		const safeOffset = Math.max(0, Math.min(offset, current.text.length));
		const after: TextBlock = { id: createId(), type: 'text', text: current.text.slice(safeOffset) };
		return {
			blocks: [
				...blocks.slice(0, index),
				{ ...current, text: current.text.slice(0, safeOffset) },
				...imageBlocks,
				after,
				...blocks.slice(index + 1)
			],
			focusId: after.id,
			focusOffset: 0
		};
	}
	const after: TextBlock = { id: createId(), type: 'text', text: '' };
	return { blocks: [...blocks, ...imageBlocks, after], focusId: after.id, focusOffset: 0 };
}

export function removeBlock(blocks: TodoContentBlock[], id: string): TodoContentBlock[] {
	const result = blocks.filter((block) => block.id !== id);
	return result.length ? result : emptyContent();
}

export function moveBlock(
	blocks: TodoContentBlock[],
	id: string,
	targetIndex: number
): TodoContentBlock[] {
	const from = blocks.findIndex((block) => block.id === id);
	if (from < 0) return blocks;
	const result = [...blocks];
	const [moved] = result.splice(from, 1);
	const adjusted = from < targetIndex ? targetIndex - 1 : targetIndex;
	result.splice(Math.max(0, Math.min(adjusted, result.length)), 0, moved);
	return result;
}

export function normalizeBlocks(blocks: TodoContentBlock[]): TodoContentBlock[] {
	let start = 0;
	let end = blocks.length;
	while (start < end && blocks[start].type === 'text' && !(blocks[start] as TextBlock).text)
		start++;
	while (end > start && blocks[end - 1].type === 'text' && !(blocks[end - 1] as TextBlock).text)
		end--;
	return blocks.slice(start, end);
}

export function isTodoContentEmpty(blocks: TodoContentBlock[]): boolean {
	return !blocks.some((block) => block.type === 'image' || block.text.trim().length > 0);
}
