<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, width = '30rem' }: { children: Snippet; width?: string } = $props();
</script>

<main class="centered" style:--panel-width={width}><section>{@render children()}</section></main>

<style>
	.centered {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		padding: var(--space-4);
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.centered section {
		width: min(100%, var(--panel-width));
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		padding: var(--space-5);
		box-shadow: var(--shadow-md);
	}
</style>
