<script lang="ts">
	import type { NewTodoImage } from '$lib/client/db/todo-service';
	import TodoImagePreview from './TodoImagePreview.svelte';

	let {
		images,
		removable = false,
		onremove
	}: { images: NewTodoImage[]; removable?: boolean; onremove?: (id: string) => void } = $props();
</script>

{#if images.length}
	<div class:single={images.length === 1} class="images">
		{#each images as image (image.id)}
			<TodoImagePreview
				blob={image.blob}
				alt="Прикреплённое изображение"
				{removable}
				onremove={() => onremove?.(image.id)}
			/>
		{/each}
	</div>
{/if}

<style>
	.images {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
		gap: 0.55rem;
		width: 100%;
	}
	.images.single {
		grid-template-columns: minmax(0, 310px);
	}
</style>
