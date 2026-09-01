<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
		$props();
</script>

<div class="section-header">
	<div>
		<h2>{title}</h2>
		{#if description}<p>{description}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
	.section-header {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--text-lg);
		line-height: 1.2;
	}
	p {
		margin-top: var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: var(--space-2);
	}
	@media (max-width: 520px) {
		.section-header {
			align-items: stretch;
			flex-direction: column;
		}
		.actions {
			width: 100%;
		}
	}
</style>
