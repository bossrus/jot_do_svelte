<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	import { IconX } from '@tabler/icons-svelte-runes';
	import IconButton from './IconButton.svelte';
	$localeVersion;
	let {
		value = $bindable<string | number>(''),
		placeholder = '',
		type = 'text',
		name,
		autocomplete,
		disabled = false,
		readonly = false,
		required = false,
		maxlength,
		minlength,
		min,
		max,
		step,
		error,
		before,
		after,
		inputRef = $bindable(),
		oninput,
		onchange,
		onfocus,
		onblur,
		onkeydown
	}: {
		value?: string | number;
		placeholder?: string;
		type?: string;
		name?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		disabled?: boolean;
		readonly?: boolean;
		required?: boolean;
		maxlength?: number;
		minlength?: number;
		min?: number | string;
		max?: number | string;
		step?: number | string;
		error?: string;
		before?: Snippet;
		after?: Snippet;
		inputRef?: HTMLInputElement;
		oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onfocus?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
		onblur?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
	} = $props();
	let focused = $state(false);
	let id = `input-${Math.random().toString(36).slice(2)}`;
	function clear() {
		if (disabled || readonly) return;
		if (inputRef) inputRef.value = '';
		value = '';
		inputRef?.dispatchEvent(new Event('input', { bubbles: true }));
		inputRef?.focus();
	}
</script>

<div
	class:error={!!error}
	class:disabled
	class:readonly
	class:filled={String(value ?? '').length > 0}
	class:focused
	class="field"
>
	{#if before}<span class="adornment">{@render before()}</span>{/if}
	<div class="control">
		<input
			bind:this={inputRef}
			bind:value
			{id}
			{type}
			{name}
			{autocomplete}
			{disabled}
			{readonly}
			{required}
			{maxlength}
			{minlength}
			{min}
			{max}
			{step}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-error` : undefined}
			oninput={(e) => oninput?.(e)}
			onchange={(e) => onchange?.(e)}
			onfocus={(e) => {
				focused = true;
				onfocus?.(e);
			}}
			onblur={(e) => {
				focused = false;
				onblur?.(e);
			}}
			{onkeydown}
		/>
		<label for={id}>{placeholder}</label>
	</div>
	{#if value && !disabled && !readonly}<span class="clear"
			><IconButton
				icon={IconX}
				label={m.clear_field({ field: placeholder })}
				onpointerdown={(event) => event.preventDefault()}
				onclick={clear}
			/></span
		>{/if}
	{#if after}<span class="adornment">{@render after()}</span>{/if}
</div>
{#if error}<small class="field-error" id={`${id}-error`} role="alert">{error}</small>{/if}

<style>
	.field {
		display: flex;
		align-items: center;
		min-height: var(--control-height);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-input-bg);
		transition:
			border-color 0.16s,
			box-shadow 0.16s;
		color: var(--color-text);
	}
	.field:hover:not(.disabled) {
		border-color: var(--color-border-strong);
	}
	.field.focused {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 3px var(--color-focus);
	}
	.field.error {
		border-color: var(--color-danger);
	}
	.control {
		position: relative;
		flex: 1;
		min-width: 0;
		height: calc(var(--control-height) - 0.05rem);
	}
	input {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		border: 0;
		outline: 0;
		background: transparent;
		color: inherit;
		padding: 0 0.68rem;
		line-height: 1.2;
		font: inherit;
	}
	label {
		position: absolute;
		left: 0.62rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0 0.16rem;
		background: var(--color-input-bg);
		color: var(--color-text-muted);
		pointer-events: none;
		transition:
			top 0.16s,
			font-size 0.16s,
			color 0.16s;
	}
	.focused label,
	.filled label {
		top: 0;
		font-size: 0.72rem;
		color: var(--color-accent);
	}
	.clear {
		display: flex;
		padding: 0 0.15rem;
	}
	.adornment {
		display: flex;
		align-items: center;
		padding: 0 0.65rem;
	}
	.disabled {
		opacity: 0.55;
	}
	.readonly {
		background: var(--color-surface-hover);
	}
	.field-error {
		display: block;
		margin: 0.3rem 0.2rem 0;
		color: var(--color-danger);
	}
</style>
