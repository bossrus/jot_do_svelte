<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		children,
		gap = 'var(--space-3)',
		justify = 'start',
		align = 'center',
		wrap = true,
		class: className = ''
	}: {
		children: Snippet;
		gap?: string;
		justify?: 'start' | 'center' | 'end' | 'space-between';
		align?: 'start' | 'center' | 'end' | 'stretch';
		wrap?: boolean;
		class?: string;
	} = $props();
</script>

<div
	class={`cluster ${className}`}
	class:wrap
	style:--cluster-gap={gap}
	style:--cluster-justify={justify}
	style:--cluster-align={align}
>
	{@render children()}
</div>

<style>
	.cluster {
		display: flex;
		min-width: 0;
		align-items: var(--cluster-align);
		justify-content: var(--cluster-justify);
		gap: var(--cluster-gap);
	}
	.wrap {
		flex-wrap: wrap;
	}
</style>
