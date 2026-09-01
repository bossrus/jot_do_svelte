<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { authService } from '$lib/client/auth';
	import { validatePassword } from '$lib/client/auth/validation';
	import Input from '$lib/components/Input.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	import CenteredPanel from '$lib/components/primitives/CenteredPanel.svelte';
	$localeVersion;
	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let success = $state(false);
	let pending = $state(false);
	async function submit() {
		error = validatePassword(password, confirmation) || '';
		const token = page.url.searchParams.get('token');
		if (error) return;
		if (!token) {
			error = m.invalid_link();
			return;
		}
		pending = true;
		const result = await authService.resetPassword(password, token);
		pending = false;
		if (result.error) error = m.invalid_link();
		else success = true;
	}
</script>

<svelte:head
	><title>{m.reset_password()} — JotDO</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>
<CenteredPanel width="26rem">
	{#if success}<h1>{m.password_changed()}</h1>
		<p>{m.password_changed_text()}</p>
		<a href={resolve('/app')}>{m.go_to_app()}</a>{:else}<h1>{m.new_password()}</h1>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<Input
				placeholder={m.password()}
				type="password"
				autocomplete="new-password"
				bind:value={password}
			/><Input
				placeholder={m.repeat_password()}
				type="password"
				autocomplete="new-password"
				bind:value={confirmation}
			/>{#if error}<p class="error" role="alert">{error}</p>{/if}<button disabled={pending}
				>{m.reset_password_action()}</button
			>
		</form>{/if}
</CenteredPanel>

<style>
	form {
		display: grid;
		gap: 0.55rem;
	}
	form {
		gap: 1rem;
	}
	button {
		border: 0;
		border-radius: 0.45rem;
		background: #326a4b;
		color: white;
		padding: 0.75rem;
		font-weight: 700;
	}
	.error {
		color: #9b2929;
	}
	a {
		color: #326a4b;
	}
</style>
