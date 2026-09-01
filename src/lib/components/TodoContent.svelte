<script lang="ts">
	import type { TodoContentBlock } from '$lib/client/content-blocks';
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import TodoImagePreview from './TodoImagePreview.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let { blocks, images }: { blocks: TodoContentBlock[]; images: NewTodoImage[] } = $props();
	let imageMap = $derived(new Map(images.map((image) => [image.id, image])));
</script>

<div class="content">
	{#each blocks as block (block.id)}
		{#if block.type === 'text'}<div class="line">{block.text || '\u00a0'}</div>
		{:else if imageMap.get(block.imageId)}<div class="image">
				<TodoImagePreview
					blob={imageMap.get(block.imageId)!.blob}
					imageId={block.imageId}
					width={imageMap.get(block.imageId)!.width}
					height={imageMap.get(block.imageId)!.height}
					alt={m.attached_image()}
				/>
			</div>{/if}
	{/each}
</div>

<style>
	.content {
		display: grid;
		gap: 0.38rem;
		min-width: 0;
	}
	.line {
		min-height: 1.4em;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.4;
	}
	.image {
		width: min(100%, 310px);
	}
</style>
