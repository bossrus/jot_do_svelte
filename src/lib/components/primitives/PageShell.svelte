<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		children,
		header,
		width = '66rem',
		class: className = ''
	}: { children: Snippet; header?: Snippet; width?: string; class?: string } = $props();
</script>

<div class={`page-shell ${className}`} style:--page-width={width}>
	{#if header}<header class="page-header">{@render header()}</header>{/if}
	<main class="page-content">{@render children()}</main>
</div>

<style>
	.page-shell {
		min-height: 100dvh;
		background: var(--color-bg);
	}
	.page-header {
		position: sticky;
		z-index: 20;
		top: 0;
		border-bottom: 1px solid var(--color-border);
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		backdrop-filter: blur(12px);
	}
	.page-content {
		width: min(100%, var(--page-width));
		margin-inline: auto;
		background: var(--color-surface);
		box-shadow: 0 0 0 1px var(--color-border);
	}
</style>
