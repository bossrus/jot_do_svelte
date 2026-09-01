<script lang="ts">
	import { authService } from '$lib/client/auth';
	import Input from './Input.svelte';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import {
		forgotPasswordSuccess,
		validateEmail,
		validatePassword
	} from '$lib/client/auth/validation';

	let { onclose }: { onclose: () => void } = $props();
	let mode = $state<'login' | 'register' | 'forgot'>('login');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let pending = $state(false);
	let forgotSent = $state(false);

	async function submit() {
		error = '';
		const emailError = validateEmail(email);
		if (emailError) {
			error = emailError;
			return;
		}
		if (mode === 'forgot') {
			pending = true;
			try {
				await authService.requestPasswordReset(email.trim());
			} finally {
				pending = false;
				forgotSent = true;
			}
			return;
		}
		if (mode === 'register') {
			if (!name.trim()) {
				error = m.name_required();
				return;
			}
			const passwordError = validatePassword(password, confirmation);
			if (passwordError) {
				error = passwordError;
				return;
			}
		} else if (password.length < 8) {
			error = m.password_min();
			return;
		}
		pending = true;
		const result =
			mode === 'register'
				? await authService.signUp(name.trim(), email.trim(), password)
				: await authService.signIn(email.trim(), password);
		pending = false;
		if (result.error) {
			error = m.login_failed();
			return;
		}
		onclose();
	}
</script>

<Modal
	title={mode === 'login' ? m.login() : mode === 'register' ? m.register() : m.reset_password()}
	{onclose}
	closeLabel={m.close()}
	width="25rem"
>
	{#if mode === 'forgot' && forgotSent}
		<p class="success">{forgotPasswordSuccess()}</p>
		<button
			class="link"
			type="button"
			onclick={() => {
				mode = 'login';
				forgotSent = false;
			}}>{m.back_to_login()}</button
		>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			{#if mode === 'register'}<Input
					placeholder={m.name()}
					autocomplete="name"
					bind:value={name}
				/>{/if}
			<Input placeholder={m.email()} type="email" autocomplete="email" bind:value={email} />
			{#if mode !== 'forgot'}
				<Input
					placeholder={m.password()}
					type="password"
					autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
					bind:value={password}
				/>
			{/if}
			{#if mode === 'register'}<Input
					placeholder={m.repeat_password()}
					type="password"
					autocomplete="new-password"
					bind:value={confirmation}
				/>{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="submit" type="submit" disabled={pending}
				>{pending
					? m.please_wait()
					: mode === 'login'
						? m.login()
						: mode === 'register'
							? m.register()
							: m.reset_password()}</button
			>
		</form>
		<div class="switches">
			{#if mode === 'login'}<button class="link" type="button" onclick={() => (mode = 'forgot')}
					>{m.forgot_password()}</button
				><button class="link" type="button" onclick={() => (mode = 'register')}
					>{m.go_to_register()}</button
				>
			{:else}<button class="link" type="button" onclick={() => (mode = 'login')}
					>{m.go_to_login()}</button
				>{/if}
		</div>
	{/if}
</Modal>

<style>
	:global(.modal-body) {
		padding: 1.5rem;
	}
	form {
		display: grid;
		gap: 0.9rem;
	}
	.submit {
		border: 0;
		border-radius: 0.5rem;
		background: #326a4b;
		color: white;
		padding: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.submit:disabled {
		opacity: 0.6;
	}
	.switches {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
	}
	.link {
		border: 0;
		background: transparent;
		padding: 0;
		color: #326a4b;
		text-decoration: underline;
		cursor: pointer;
	}
	.error {
		margin: 0;
		color: #9b2929;
		font-size: 0.86rem;
	}
	.success {
		color: #285c40;
		line-height: 1.5;
	}
</style>
