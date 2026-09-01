<script lang="ts">
	import type { Component } from 'svelte';

	type IconComponent = Component<{
		size?: number | string;
		stroke?: number | string;
		'aria-hidden'?: 'true' | 'false';
	}>;

	let {
		icon: Icon,
		label,
		disabled = false,
		active = false,
		onclick,
		onpointerdown
	}: {
		icon: IconComponent;
		label: string;
		disabled?: boolean;
		active?: boolean;
		onclick?: (event: MouseEvent) => void;
		onpointerdown?: (event: PointerEvent) => void;
	} = $props();
</script>

<span class="icon-button-wrap">
	<button
		type="button"
		class:active
		{disabled}
		aria-label={label}
		aria-pressed={active || undefined}
		onclick={(event) => {
			event.stopPropagation();
			onclick?.(event);
		}}
		onpointerdown={(event) => onpointerdown?.(event)}
	>
		<Icon size={17} stroke={1.8} aria-hidden="true" />
	</button>
	<span class="tooltip" role="tooltip">{label}</span>
</span>

<style>
	.icon-button-wrap {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	button {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		padding: 0;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background 120ms,
			border-color 120ms,
			color 120ms,
			transform 80ms;
	}
	button:hover,
	button.active {
		border-color: var(--color-border);
		background: var(--color-surface-hover);
		color: var(--color-accent);
	}
	button:active:not(:disabled) {
		transform: translateY(1px);
	}
	button:focus-visible {
		outline: 3px solid var(--color-focus);
		outline-offset: 1px;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	.tooltip {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.4rem);
		z-index: 30;
		width: max-content;
		max-width: 12rem;
		border-radius: 0.35rem;
		background: var(--color-text);
		padding: 0.3rem 0.45rem;
		color: var(--color-surface);
		font-size: 0.72rem;
		line-height: 1.2;
		opacity: 0;
		pointer-events: none;
		transform: translateY(0.2rem);
		transition:
			opacity 100ms,
			transform 100ms;
	}
	.icon-button-wrap:hover .tooltip,
	button:focus-visible + .tooltip {
		opacity: 1;
		transform: translateY(0);
	}
	@media (hover: none) {
		.tooltip {
			display: none;
		}
	}
</style>
