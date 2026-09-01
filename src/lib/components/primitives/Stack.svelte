<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		children,
		gap = 'var(--space-4)',
		align = 'stretch',
		class: className = ''
	}: {
		children: Snippet;
		gap?: string;
		align?: 'start' | 'center' | 'end' | 'stretch';
		class?: string;
	} = $props();
</script>

<div class={`stack ${className}`} style:--stack-gap={gap} style:--stack-align={align}>
	{@render children()}
</div>

<style>
	.stack {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: var(--stack-align);
		gap: var(--stack-gap);
	}
</style>
