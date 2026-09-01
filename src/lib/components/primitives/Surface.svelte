<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		children,
		padding = 'var(--space-5)',
		radius = 'var(--radius-lg)',
		elevated = false,
		class: className = ''
	}: {
		children: Snippet;
		padding?: string;
		radius?: string;
		elevated?: boolean;
		class?: string;
	} = $props();
</script>

<div
	class={`surface ${className}`}
	class:elevated
	style:--surface-padding={padding}
	style:--surface-radius={radius}
>
	{@render children()}
</div>

<style>
	.surface {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--surface-radius);
		background: var(--color-surface);
		padding: var(--surface-padding);
	}
	.elevated {
		box-shadow: var(--shadow-md);
	}
</style>
