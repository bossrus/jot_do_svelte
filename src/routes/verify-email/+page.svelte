<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { authService, session } from '$lib/client/auth';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	import CenteredPanel from '$lib/components/primitives/CenteredPanel.svelte';
	$localeVersion;

	let refreshed = $state(false);
	let resendPending = $state(false);
	let resendMessage = $state('');
	let invalid = $derived(Boolean(page.url.searchParams.get('error')));

	onMount(async () => {
		await authService.refreshSession();
		refreshed = true;
	});

	async function resend() {
		const email = $session.data?.user.email;
		if (!email) return;
		resendPending = true;
		const result = await authService.resendVerification(email);
		resendPending = false;
		resendMessage = result.error ? m.mail_failed() : m.mail_sent();
	}
</script>

<svelte:head
	><title>{m.verify_email_title()} — JotDO</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>

<CenteredPanel>
	{#if !refreshed}
		<h1>{m.checking_verification()}</h1>
	{:else if invalid}
		<h1>{m.invalid_link()}</h1>
		<p>{m.request_new_email()}</p>
		{#if $session.data && !$session.data.user.emailVerified}
			<button type="button" disabled={resendPending} onclick={() => void resend()}>
				{resendPending ? m.sending() : m.send_new_email()}
			</button>
			{#if resendMessage}<p role="status">{resendMessage}</p>{/if}
		{/if}
	{:else if $session.data?.user.emailVerified}
		<h1>{m.email_verified()}</h1>
		<p>{m.cloud_features_available()}</p>
		<a href={resolve('/app')}>{m.go_to_app()}</a>
	{:else}
		<h1>{m.email_already_verified()}</h1>
		<p>{m.sign_in_to_continue()}</p>
		<a href={resolve('/app')}>{m.go_to_app()}</a>
	{/if}
</CenteredPanel>

<style>
	:global(body) {
		margin: 0;
		background: #f6f7f4;
		color: #1c241f;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	h1 {
		margin: 0 0 0.8rem;
		font-size: 1.45rem;
	}
	p {
		color: #59665d;
		line-height: 1.5;
	}
	a,
	button {
		display: inline-block;
		border: 0;
		border-radius: 0.48rem;
		background: #326a4b;
		color: white;
		padding: 0.68rem 0.85rem;
		font: inherit;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
	}
	[role='status'] {
		font-size: 0.85rem;
	}
</style>
