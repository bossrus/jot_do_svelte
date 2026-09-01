<script lang="ts" module>
	export type SelectOption<Value extends string | number> = {
		value: Value;
		label: string;
		disabled?: boolean;
	};
</script>

<script lang="ts" generics="Value extends string | number">
	import type { Snippet } from 'svelte';
	import { IconCheck, IconChevronDown } from '@tabler/icons-svelte-runes';
	type MenuContext = {
		options: readonly SelectOption<Value>[];
		value: Value | undefined;
		select: (value: Value) => void;
		close: () => void;
	};
	let {
		value = $bindable(),
		options,
		ariaLabel,
		name,
		disabled = false,
		required = false,
		before,
		after,
		menu,
		onchange
	}: {
		value?: Value;
		options: readonly SelectOption<Value>[];
		ariaLabel: string;
		name?: string;
		disabled?: boolean;
		required?: boolean;
		before?: Snippet;
		after?: Snippet;
		menu?: Snippet<[MenuContext]>;
		onchange?: (value: Value) => void;
	} = $props();
	let root = $state<HTMLDivElement>();
	let menuElement = $state<HTMLDivElement>();
	let open = $state(false);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuWidth = $state(0);
	let menuMaxHeight = $state(240);
	let menuAbove = $state(false);
	let selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? '');
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
	function positionMenu() {
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const gap = 6;
		const viewportPadding = 8;
		const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
		const spaceAbove = rect.top - gap - viewportPadding;
		menuAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
		menuWidth = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
		menuLeft = Math.min(
			Math.max(viewportPadding, rect.left),
			window.innerWidth - menuWidth - viewportPadding
		);
		menuMaxHeight = Math.max(80, Math.min(240, menuAbove ? spaceAbove : spaceBelow));
		menuTop = menuAbove ? rect.top - gap : rect.bottom + gap;
	}
	function toggle() {
		if (disabled) return;
		open = !open;
		if (open) positionMenu();
	}
	function close() {
		open = false;
	}
	function select(nextValue: Value) {
		value = nextValue;
		onchange?.(nextValue);
		close();
	}
	function move(direction: 1 | -1) {
		const available = options.filter((option) => !option.disabled);
		if (!available.length) return;
		const current = available.findIndex((option) => option.value === value);
		select(
			available[current < 0 ? 0 : (current + direction + available.length) % available.length].value
		);
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) open = true;
			else move(event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Escape') close();
	}
	$effect(() => {
		if (!open) return;
		positionMenu();
		window.addEventListener('resize', positionMenu);
		window.addEventListener('scroll', positionMenu, true);
		return () => {
			window.removeEventListener('resize', positionMenu);
			window.removeEventListener('scroll', positionMenu, true);
		};
	});
</script>

<svelte:window
	onclick={(event) =>
		open &&
		root &&
		!root.contains(event.target as Node) &&
		!menuElement?.contains(event.target as Node) &&
		close()}
/>
<div class="select" class:disabled class:open bind:this={root}>
	{#if name}<input type="hidden" {name} value={value ?? ''} {required} />{/if}
	<button
		type="button"
		class="trigger"
		{disabled}
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={toggle}
		onkeydown={keydown}
	>
		{#if before}<span class="slot before">{@render before()}</span>{/if}
		<span class="value">{selectedLabel}</span>
		<span class="slot after"
			>{#if after}{@render after()}{:else}<IconChevronDown
					size={17}
					stroke={1.8}
					aria-hidden="true"
				/>{/if}</span
		>
	</button>
	{#if open}<div
			class="menu"
			role="listbox"
			aria-label={ariaLabel}
			bind:this={menuElement}
			use:portal
			style:top={`${menuTop}px`}
			style:left={`${menuLeft}px`}
			style:width={`${menuWidth}px`}
			style:transform={menuAbove ? 'translateY(-100%)' : undefined}
			style:--menu-max-height={`${menuMaxHeight}px`}
		>
			{#if menu}{@render menu({ options, value, select, close })}
			{:else}{#each options as option (option.value)}<button
						type="button"
						class="option"
						class:selected={option.value === value}
						disabled={option.disabled}
						role="option"
						aria-selected={option.value === value}
						onclick={() => select(option.value)}
						><span>{option.label}</span>{#if option.value === value}<IconCheck
								size={17}
								stroke={2}
								aria-hidden="true"
							/>{/if}</button
					>{/each}{/if}
		</div>{/if}
</div>

<style>
	.select {
		position: relative;
		width: 100%;
	}
	.trigger {
		display: flex;
		width: 100%;
		height: var(--control-height);
		align-items: center;
		gap: 0.4rem;
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-input-bg);
		padding: 0 0.6rem;
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.16s,
			box-shadow 0.16s;
	}
	.trigger:hover:not(:disabled) {
		border-color: var(--color-border-strong);
	}
	.trigger:focus-visible,
	.open .trigger {
		outline: 0;
		border-color: var(--color-accent, #326a4b);
		box-shadow: 0 0 0 3px var(--color-focus, rgb(50 106 75 / 20%));
	}
	.value {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slot {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
	}
	.after {
		margin-left: auto;
	}
	.open .after {
		transform: rotate(180deg);
	}
	.menu {
		position: fixed;
		z-index: 1000;
		display: grid;
		box-sizing: border-box;
		max-height: var(--menu-max-height, 15rem);
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		padding: 0.35rem;
		box-shadow: var(--shadow-md);
	}
	.option {
		display: flex;
		width: 100%;
		min-height: 2.55rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border: 0;
		border-radius: 0.45rem;
		background: transparent;
		padding: 0.5rem 0.6rem;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.option:hover:not(:disabled),
	.option.selected {
		background: var(--color-surface-hover);
		color: var(--color-accent);
	}
	.option:focus-visible {
		outline: 2px solid rgb(50 106 75 / 28%);
		outline-offset: -2px;
	}
	.option:disabled,
	.disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	@media (max-width: 540px) {
		.menu {
			max-height: 12rem;
		}
	}
</style>
