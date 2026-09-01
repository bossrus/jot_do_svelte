<script lang="ts" module>
	export type ModalAction = {
		label: string;
		onclick: () => void;
		variant?: 'default' | 'primary' | 'danger';
		disabled?: boolean;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	let {
		title,
		onclose,
		actions = [],
		children,
		header,
		footer,
		showFooter = true,
		width = '40rem',
		height = 'auto',
		maxHeight = 'calc(100dvh - 2rem)',
		zIndex = 600,
		closeLabel = m.close(),
		dialog = $bindable()
	}: {
		title: string;
		onclose: () => void;
		actions?: ModalAction[];
		children: Snippet;
		header?: Snippet;
		footer?: Snippet;
		showFooter?: boolean;
		width?: string;
		height?: string;
		maxHeight?: string;
		zIndex?: number;
		closeLabel?: string;
		dialog?: HTMLDivElement;
	} = $props();

	const modalId = $props.id();
	const titleId = `${modalId}-title`;
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onclose()} />
<div
	class="modal-backdrop"
	role="presentation"
	style:z-index={zIndex}
	onclick={(event) => event.target === event.currentTarget && onclose()}
>
	<div
		bind:this={dialog}
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		style:--modal-width={width}
		style:--modal-height={height}
		style:--modal-max-height={maxHeight}
	>
		<header class="modal-header">
			<h2 id={titleId}>{title}</h2>
			{#if header}<div class="modal-header-content">{@render header()}</div>{/if}
			<button class="modal-close" type="button" aria-label={closeLabel} onclick={onclose}>×</button>
		</header>
		<div class="modal-body">{@render children()}</div>
		{#if (footer && showFooter) || actions.length}
			<footer class="modal-footer">
				{#if footer && showFooter}<div class="modal-footer-content">{@render footer()}</div>{/if}
				{#if actions.length}<div class="modal-actions">
						{#each actions as action, index (index)}<button
								type="button"
								class:primary={action.variant === 'primary'}
								class:danger={action.variant === 'danger'}
								disabled={action.disabled}
								onclick={action.onclick}>{action.label}</button
							>{/each}
					</div>{/if}
			</footer>
		{/if}
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		min-width: 0;
		padding: 1rem;
		background: var(--color-overlay, rgb(15 25 19 / 62%));
	}
	.modal {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(100%, var(--modal-width));
		height: var(--modal-height);
		max-height: var(--modal-max-height);
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		border: 1px solid var(--color-border, #dce1dc);
		border-radius: 0.9rem;
		background: var(--color-surface, #f8f9f7);
		box-shadow: 0 24px 70px var(--color-shadow, rgb(10 15 11 / 28%));
	}
	.modal-header {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		border-bottom: 1px solid var(--color-border, #dce1dc);
		background: var(--color-surface, white);
		padding: 0.7rem 0.75rem 0.7rem 1.2rem;
	}
	h2 {
		flex: none;
		margin: 0;
		font-size: 1.05rem;
	}
	.modal-header-content {
		flex: 1;
		min-width: 0;
	}
	.modal-close {
		flex: none;
		margin-left: auto;
		border: 0;
		background: transparent;
		padding: 0.2rem 0.45rem;
		color: inherit;
		font: inherit;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
	}
	.modal-body {
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}
	.modal-footer {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.75rem;
		border-top: 1px solid var(--color-border, #dce1dc);
		background: var(--color-surface, white);
		padding: 0.75rem 1.2rem;
	}
	.modal-footer-content {
		flex: 1;
		min-width: 0;
	}
	.modal-actions {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.modal-actions button {
		border: 1px solid var(--color-border, #cbd3cd);
		border-radius: 0.45rem;
		background: var(--color-surface, white);
		padding: 0.55rem 0.8rem;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.modal-actions button.primary {
		border-color: var(--color-accent, #326a4b);
		background: var(--color-accent, #326a4b);
		color: white;
	}
	.modal-actions button.danger {
		color: var(--color-danger, #9b2424);
	}
	.modal-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	@media (max-width: 620px) {
		.modal-backdrop {
			padding: 0;
		}
		.modal {
			max-height: 100dvh;
			border-radius: 0;
		}
	}
</style>
