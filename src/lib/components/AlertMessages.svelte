<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { IconAlertCircle, IconCheck, IconX } from '@tabler/icons-svelte-runes';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;

	export type AlertMessage = {
		id: number;
		type: 'success' | 'error';
		message: string;
	};

	let {
		alerts,
		onclose,
		duration = 4000
	}: {
		alerts: AlertMessage[];
		onclose: (id: number) => void;
		duration?: number;
	} = $props();

	const timers = new Map<number, number>();

	$effect(() => {
		const activeIds = new Set(alerts.map((alert) => alert.id));
		for (const alert of alerts) {
			if (timers.has(alert.id)) continue;
			const timeout = window.setTimeout(() => {
				timers.delete(alert.id);
				onclose(alert.id);
			}, duration);
			timers.set(alert.id, timeout);
		}
		for (const [id, timeout] of timers) {
			if (activeIds.has(id)) continue;
			window.clearTimeout(timeout);
			timers.delete(id);
		}
	});

	onDestroy(() => {
		for (const timeout of timers.values()) window.clearTimeout(timeout);
	});
</script>

<div class="alert-stack" aria-live="polite" aria-atomic="false">
	{#each alerts as alert (alert.id)}
		{@const Icon = alert.type === 'success' ? IconCheck : IconAlertCircle}
		<div
			class:error={alert.type === 'error'}
			class="alert"
			role={alert.type === 'error' ? 'alert' : 'status'}
			in:fly={{ x: 24, duration: 220 }}
			out:fade={{ duration: 160 }}
		>
			<Icon class="status-icon" size={22} stroke={2.2} aria-hidden="true" />
			<span>{alert.message}</span>
			<button
				type="button"
				aria-label={m.close_message()}
				title={m.close_message()}
				onclick={() => onclose(alert.id)}
			>
				<IconX size={18} aria-hidden="true" />
			</button>
		</div>
	{/each}
</div>

<style>
	.alert-stack {
		position: fixed;
		top: 1.25rem;
		right: 1.25rem;
		z-index: 2000;
		display: grid;
		width: min(23rem, calc(100vw - 2rem));
		gap: 0.65rem;
		pointer-events: none;
	}
	.alert {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.7rem;
		min-height: 3.5rem;
		border: 1px solid #a7d8b5;
		border-left: 4px solid #20a34a;
		border-radius: 0.75rem;
		background: #f0fff4;
		padding: 0.75rem 0.8rem;
		color: #176b32;
		box-shadow: 0 12px 32px rgb(15 23 42 / 0.16);
		pointer-events: auto;
	}
	.alert.error {
		border-color: #f0b4b4;
		border-left-color: #dc2626;
		background: #fff4f4;
		color: #a71919;
	}
	:global(.status-icon) {
		flex: none;
	}
	.alert span {
		overflow-wrap: anywhere;
		font-size: 0.92rem;
		font-weight: 650;
		line-height: 1.35;
	}
	.alert button {
		display: grid;
		width: 1.8rem;
		height: 1.8rem;
		place-items: center;
		border: 0;
		border-radius: 0.4rem;
		background: transparent;
		color: currentColor;
		cursor: pointer;
		opacity: 0.68;
	}
	.alert button:hover {
		background: rgb(0 0 0 / 0.06);
		opacity: 1;
	}
	@media (max-width: 600px) {
		.alert-stack {
			top: 0.75rem;
			right: 0.75rem;
			width: calc(100vw - 1.5rem);
		}
	}
</style>
