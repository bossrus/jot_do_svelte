<script lang="ts">
	import { onMount } from 'svelte';
	import { imageMarkupService } from '$lib/client/markup/markup-service';
	import type { ImageMarkupObject } from '$lib/client/markup/types';
	import ImageMarkupModal from './ImageMarkupModal.svelte';
	import ImageMarkupPreview from './ImageMarkupPreview.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	let {
		blob,
		alt = '',
		removable = false,
		onremove,
		imageId,
		width = null,
		height = null,
		viewerMode = 'edit',
		initialMarkup,
		onmarkupchange
	}: {
		blob: Blob;
		alt?: string;
		removable?: boolean;
		onremove?: () => void;
		imageId?: string;
		width?: number | null;
		height?: number | null;
		viewerMode?: 'view' | 'edit';
		initialMarkup?: ImageMarkupObject[];
		onmarkupchange?: (objects: ImageMarkupObject[]) => void;
	} = $props();
	let url = $state('');
	let open = $state(false);
	let markupObjects = $state<ImageMarkupObject[]>([]);

	onMount(() => {
		url = URL.createObjectURL(blob);
		if (initialMarkup) markupObjects = initialMarkup;
		else if (imageId) {
			void imageMarkupService
				.load(imageId)
				.then((objects) => (markupObjects = objects))
				.catch((error) => console.error('Image markup preview load failed', error));
		}
		return () => URL.revokeObjectURL(url);
	});
</script>

<figure class:interactive={Boolean(imageId)}>
	{#if url}<button
			class="preview"
			type="button"
			disabled={!imageId}
			aria-label={imageId
				? viewerMode === 'view'
					? m.open_image_view()
					: m.open_image_editor()
				: undefined}
			onclick={() => imageId && (open = true)}
			><img src={url} {alt} />
			<ImageMarkupPreview
				objects={markupObjects}
				imageWidth={width ?? 1}
				imageHeight={height ?? 1}
			/></button
		>{/if}
	{#if removable}
		<button type="button" aria-label={m.remove_image()} title={m.remove_image()} onclick={onremove}
			>×</button
		>
	{/if}
</figure>
{#if open && imageId}<ImageMarkupModal
		mode={viewerMode}
		{imageId}
		{blob}
		{width}
		{height}
		initialObjects={initialMarkup}
		onpersist={initialMarkup
			? async (objects) => {
					markupObjects = objects;
					onmarkupchange?.(objects);
				}
			: undefined}
		onmarkupchange={(objects) => {
			markupObjects = objects;
			if (initialMarkup) onmarkupchange?.(objects);
		}}
		onclose={() => (open = false)}
	/>{/if}

<style>
	figure {
		position: relative;
		min-width: 0;
		margin: 0;
		overflow: hidden;
		border: 1px solid #d8ded9;
		border-radius: 0.55rem;
		background: #eef1ee;
		aspect-ratio: 4 / 3;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.preview {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		padding: 0;
		background: transparent;
	}
	.preview:disabled {
		cursor: default;
	}
	.interactive .preview {
		cursor: crosshair;
	}
	figure > button:not(.preview) {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: rgb(20 27 22 / 78%);
		color: #fff;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
</style>
