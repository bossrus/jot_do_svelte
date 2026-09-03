<script lang="ts">
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import { visibleContentBlocks } from '$lib/client/content-viewer';
	import TodoImagePreview from './TodoImagePreview.svelte';
	import type { ImageMarkupObject } from '$lib/client/markup/types';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	type ContentImage = {
		id: string;
		blob: Blob;
		width: number | null;
		height: number | null;
		markup?: ImageMarkupObject[];
	};
	let {
		blocks,
		images,
		imageViewerMode = 'view'
	}: {
		blocks: TodoContentBlock[];
		images: ContentImage[];
		imageViewerMode?: 'view' | 'edit';
	} = $props();
	let imageMap = $derived(new Map(images.map((image) => [image.id, image])));
	let visibleBlocks = $derived(visibleContentBlocks(blocks, new Set(imageMap.keys())));
</script>

<div class="content" data-testid="content-viewer">
	{#each visibleBlocks as block (block.id)}
		{#if block.type === 'text'}
			<div class="line" data-block-type="text">{block.text || '\u00a0'}</div>
		{:else}
			<div class="image" data-block-type="image">
				<TodoImagePreview
					blob={imageMap.get(block.imageId)!.blob}
					imageId={block.imageId}
					width={imageMap.get(block.imageId)!.width}
					height={imageMap.get(block.imageId)!.height}
					viewerMode={imageViewerMode}
					initialMarkup={imageMap.get(block.imageId)!.markup}
					alt={m.attached_image()}
				/>
			</div>
		{/if}
	{/each}
</div>

<style>
	.content {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}
	.line {
		min-height: 1.45em;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}
	.image {
		width: min(100%, 680px);
	}
	.image > :global(figure) {
		max-height: 65vh;
	}
</style>
