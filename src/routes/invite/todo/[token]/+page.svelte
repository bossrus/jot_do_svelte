<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authService } from '$lib/client/auth';
	import { todoInvitesApi } from '$lib/client/todo-invites';
	import type { TodoInvitePreview } from '$lib/todos/invite-contracts';
	import AuthModal from '$lib/components/AuthModal.svelte';
	import CenteredPanel from '$lib/components/primitives/CenteredPanel.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let preview = $state<TodoInvitePreview | null>(null),
		loading = $state(true),
		pending = $state(false),
		error = $state(''),
		authOpen = $state(false);
	let token = $derived(page.params.token ?? '');
	onMount(async () => {
		await authService.refreshSession().catch(() => undefined);
		await load();
	});
	async function load() {
		loading = true;
		error = '';
		try {
			preview = await todoInvitesApi.preview(token);
		} catch {
			error = m.invite_check_failed();
		} finally {
			loading = false;
		}
	}
	async function requestAccess() {
		pending = true;
		error = '';
		try {
			await todoInvitesApi.request(token);
			await load();
		} catch {
			error = m.invite_request_failed();
		} finally {
			pending = false;
		}
	}
	async function closeAuth() {
		authOpen = false;
		await authService.refreshSession().catch(() => undefined);
		await load();
	}
	function openTodo() {
		if (preview?.todoId) void goto(resolve(`/app?todo=${encodeURIComponent(preview.todoId)}`));
	}
	function openApp() {
		void goto(resolve('/app'));
	}
</script>

<svelte:head
	><title>{m.invite_title()} · JotDO</title><meta
		name="robots"
		content="noindex,nofollow"
	/></svelte:head
>
<CenteredPanel width="31rem">
	<p class="eyebrow">JotDO</p>
	<h1>{m.invite_title()}</h1>
	{#if loading}<p>{m.checking_link()}</p>{:else if error}<p class="error" role="alert">
			{error}
		</p>{:else if preview}
		{#if preview.owner?.name}<p>{m.owner_named({ name: preview.owner.name })}</p>{/if}
		{#if preview.state === 'invalid'}<p>{m.invalid_invite()}</p>
		{:else if preview.state === 'loginRequired'}<p>
				{m.invite_login_hint()}
			</p>
			<button class="primary" type="button" onclick={() => (authOpen = true)}
				>{m.sign_in_or_register()}</button
			>
		{:else if preview.state === 'canRequest' || preview.state === 'rejected'}<p>
				{preview.state === 'rejected' ? m.previous_request_rejected() : m.invite_request_hint()}
			</p>
			<button class="primary" type="button" disabled={pending} onclick={() => void requestAccess()}
				>{pending ? m.requesting() : m.request_access()}</button
			>
		{:else if preview.state === 'pending'}<p class="status">
				{m.request_pending_owner()}
			</p>
			<button class="primary" type="button" onclick={openApp}>{m.back_to_app()}</button>
		{:else}<p class="status">
				{preview.state === 'owner' ? m.your_todo() : m.access_already_granted()}
			</p>
			<button class="primary" type="button" onclick={openTodo}>{m.open_todo()}</button>{/if}
	{/if}
</CenteredPanel>
{#if authOpen}<AuthModal onclose={() => void closeAuth()} />{/if}

<style>
	:global(body) {
		margin: 0;
		background: #f6f7f4;
		color: #1c241f;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.eyebrow {
		margin: 0;
		color: #647168;
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.14em;
	}
	h1 {
		margin: 0.45rem 0 1rem;
		font-size: 1.65rem;
	}
	p {
		line-height: 1.55;
	}
	.primary {
		border: 0;
		border-radius: 0.5rem;
		background: #326a4b;
		color: white;
		padding: 0.72rem 0.95rem;
		font-weight: 700;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.55;
	}
	.error {
		color: #922b2b;
	}
	.status {
		color: #326a4b;
	}
</style>
