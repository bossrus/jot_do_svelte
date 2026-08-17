<script lang="ts">
	import { onMount } from 'svelte';

	let {
		blob,
		alt = '',
		removable = false,
		onremove
	}: { blob: Blob; alt?: string; removable?: boolean; onremove?: () => void } = $props();
	let url = $state('');

	onMount(() => {
		url = URL.createObjectURL(blob);
		return () => URL.revokeObjectURL(url);
	});
</script>

<figure>
	{#if url}<img src={url} {alt} />{/if}
	{#if removable}
		<button
			type="button"
			aria-label="Удалить изображение"
			title="Удалить изображение"
			onclick={onremove}>×</button
		>
	{/if}
</figure>

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
		object-fit: cover;
	}
	button {
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
