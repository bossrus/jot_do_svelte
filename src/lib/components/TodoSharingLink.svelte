<script lang="ts">
	import { todoInvitesApi } from '$lib/client/todo-invites';
	import { IconCopy, IconLink, IconRefresh, IconUnlink } from '@tabler/icons-svelte-runes';
	import IconButton from './IconButton.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let {
		todoId,
		disabled = false,
		disabledTitle = m.share_plan_required(),
		onsuccess = () => {},
		onerror = () => {}
	}: {
		todoId: string;
		disabled?: boolean;
		disabledTitle?: string;
		onsuccess?: (message: string) => void;
		onerror?: (message: string) => void;
	} = $props();
	function fail(message: string) {
		error = message;
		onerror(message);
	}
	let active = $state(false),
		url = $state(''),
		loading = $state(true),
		pending = $state(false),
		error = $state('');
	$effect(() => {
		const id = todoId;
		if (disabled) {
			loading = false;
			active = false;
			url = '';
			return;
		}
		loading = true;
		void todoInvitesApi
			.link(id)
			.then((value) => (active = value.active))
			.catch(() => fail(m.link_load_failed()))
			.finally(() => (loading = false));
	});
	async function rotate() {
		pending = true;
		error = '';
		try {
			const result = await todoInvitesApi.rotate(todoId);
			active = true;
			url = result.url ?? '';
			onsuccess(m.new_link_created());
		} catch {
			fail(m.link_create_failed());
		} finally {
			pending = false;
		}
	}
	async function disableLink() {
		pending = true;
		error = '';
		try {
			await todoInvitesApi.disable(todoId);
			active = false;
			url = '';
			onsuccess(m.link_disabled());
		} catch {
			fail(m.link_disable_failed());
		} finally {
			pending = false;
		}
	}
	async function copy() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			onsuccess(m.link_copied());
		} catch {
			fail(m.link_copy_failed());
		}
	}
</script>

<div class="sharing">
	<strong>{m.invite_link()}</strong>
	<div class="link-row">
		{#if loading}<small>{m.loading()}</small>{:else if url}<input
				readonly
				value={url}
				aria-label={m.invite_link()}
			/>{:else if active}<small>{m.link_active_hint()}</small>{:else}<small>{m.link_off()}</small
			>{/if}
		<div class="actions" title={disabled ? disabledTitle : undefined}>
			{#if url}<IconButton
					icon={IconCopy}
					label={m.copy_link()}
					onclick={() => void copy()}
				/>{/if}<IconButton
				icon={active ? IconRefresh : IconLink}
				label={active ? m.create_new_link() : m.create_link()}
				disabled={disabled || pending}
				onclick={() => void rotate()}
			/>{#if active}<IconButton
					icon={IconUnlink}
					label={m.disable_link()}
					disabled={pending}
					onclick={() => void disableLink()}
				/>{/if}
		</div>
	</div>
	{#if error}<small class="error" role="alert">{error}</small>{/if}
</div>

<style>
	.sharing {
		display: grid;
		gap: 0.55rem;
		margin-bottom: 1rem;
		border-bottom: 1px dashed #dce1dc;
		padding-bottom: 1rem;
	}
	.link-row {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.25rem;
	}
	input {
		min-width: 0;
		flex: 1;
		border: 1px solid #cbd3cd;
		border-radius: 0.45rem;
		padding: 0.5rem;
	}
	small {
		color: #69746c;
	}
	.error {
		color: #922b2b;
	}
</style>
