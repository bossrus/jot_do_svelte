import type { TodoContentBlock } from './content-blocks';

export function visibleContentBlocks(
	blocks: TodoContentBlock[],
	availableImageIds: ReadonlySet<string>
): TodoContentBlock[] {
	return blocks.filter((block) => block.type === 'text' || availableImageIds.has(block.imageId));
}
