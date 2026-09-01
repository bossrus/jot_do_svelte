<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let {
		name,
		image = null,
		size = 36
	}: { name: string; image?: string | null; size?: number } = $props();
	let failedImage = $state<string | null>(null);
	let showImage = $derived(Boolean(image && failedImage !== image));
	let initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toLocaleUpperCase())
			.join('') || '?'
	);
</script>

<span
	class="avatar"
	style:width={`${size}px`}
	style:height={`${size}px`}
	style:font-size={`${Math.max(10, Math.round(size * 0.34))}px`}
	aria-label={m.user_avatar({ name })}
>
	{#if showImage}<img src={image!} alt="" onerror={() => (failedImage = image)} />{:else}<span
			aria-hidden="true">{initials}</span
		>{/if}
</span>

<style>
	.avatar {
		display: inline-grid;
		flex: none;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--color-border, #ced7d0);
		border-radius: 50%;
		background: var(--color-surface-hover, #e8f0ea);
		color: var(--color-accent, #326a4b);
		font-weight: 750;
		line-height: 1;
		user-select: none;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
