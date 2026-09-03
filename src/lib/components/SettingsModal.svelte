<script lang="ts">
	import Input from './Input.svelte';
	import Modal from './Modal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { changeLocale, currentLocale, localeVersion, type AppLocale } from '$lib/client/locale';
	import { changeTheme, readTheme, type AppTheme } from '$lib/client/theme';
	import { authService, session } from '$lib/client/auth';
	import UserAvatar from './UserAvatar.svelte';
	import { isImportableImage } from '$lib/client/images';
	import { validatePassword } from '$lib/client/auth/validation';
	import {
		IconDeviceFloppy,
		IconLoader2,
		IconPhotoUp,
		IconTrash
	} from '@tabler/icons-svelte-runes';
	let { onclose }: { onclose: () => void } = $props();
	$localeVersion;
	let locale = $state<AppLocale>(currentLocale());
	function t<I extends object>(
		message: (inputs: I, options?: { locale?: AppLocale }) => string,
		inputs = {} as I
	) {
		return message(inputs, { locale });
	}
	let theme = $state<AppTheme>(readTheme());
	let name = $state($session.data?.user.name ?? '');
	let email = $state($session.data?.user.email ?? '');
	let avatarPreview = $state($session.data?.user.image ?? '');
	let avatarPicker = $state<HTMLInputElement>();
	let namePending = $state(false),
		emailPending = $state(false),
		avatarPending = $state(false),
		passwordPending = $state(false);
	let nameError = $state(''),
		emailError = $state(''),
		emailNotice = $state(''),
		avatarError = $state(''),
		passwordError = $state(''),
		passwordNotice = $state('');
	let currentPassword = $state(''),
		newPassword = $state(''),
		passwordConfirmation = $state('');
	let accountPending = $derived(namePending || emailPending);
	let accountChanged = $derived(
		name.trim() !== ($session.data?.user.name ?? '') ||
			email.trim().toLowerCase() !== ($session.data?.user.email ?? '').toLowerCase()
	);
	function chooseLocale(value: AppLocale) {
		locale = value;
		changeLocale(value);
	}
	function chooseTheme(value: AppTheme) {
		theme = value;
		changeTheme(value);
	}
	async function saveName() {
		const next = name.trim(),
			old = $session.data?.user.name ?? '';
		if (!next || next === old || namePending) return;
		namePending = true;
		nameError = '';
		const result = await authService.updateName(next);
		namePending = false;
		if (result.error) nameError = t(m.save_failed);
		else await authService.refreshSession();
	}
	async function saveEmail() {
		const next = email.trim(),
			old = $session.data?.user.email ?? '';
		if (!next || next === old || emailPending) return;
		emailPending = true;
		emailError = '';
		emailNotice = '';
		const result = await authService.changeEmail(next);
		emailPending = false;
		if (result.error) emailError = t(m.save_failed);
		else {
			emailNotice = t(m.email_verification_sent);
			await authService.refreshSession();
		}
	}
	async function saveAccount() {
		if (accountPending || !accountChanged) return;
		if (name.trim() !== ($session.data?.user.name ?? '')) await saveName();
		if (email.trim().toLowerCase() !== ($session.data?.user.email ?? '').toLowerCase())
			await saveEmail();
	}
	async function savePassword() {
		if (passwordPending) return;
		passwordError = '';
		passwordNotice = '';
		if (!currentPassword) {
			passwordError = t(m.current_password_required);
			return;
		}
		passwordError = validatePassword(newPassword, passwordConfirmation) || '';
		if (passwordError) return;
		passwordPending = true;
		const result = await authService.changePassword(currentPassword, newPassword);
		passwordPending = false;
		if (result.error) {
			passwordError = t(m.password_change_failed);
			return;
		}
		currentPassword = '';
		newPassword = '';
		passwordConfirmation = '';
		passwordNotice = t(m.password_change_success);
	}
	function passwordEnter(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		void savePassword();
	}
	async function uploadAvatar(file: File) {
		if (avatarPending) return;
		if (!isImportableImage(file)) {
			avatarError = t(m.avatar_format_error);
			return;
		}
		avatarPending = true;
		avatarError = '';
		const localPreview = URL.createObjectURL(file);
		avatarPreview = localPreview;
		try {
			const response = await fetch('/api/avatar', {
				method: 'POST',
				headers: { 'content-type': file.type },
				body: file
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { code?: string };
				throw new Error(
					body.code === 'IMAGE_TOO_LARGE' ? t(m.image_too_large) : t(m.avatar_upload_failed)
				);
			}
			const body = (await response.json()) as { image: string };
			avatarPreview = body.image;
			await authService.refreshSession();
		} catch (error) {
			avatarPreview = $session.data?.user.image ?? '';
			avatarError = error instanceof Error ? error.message : t(m.avatar_upload_failed);
		} finally {
			URL.revokeObjectURL(localPreview);
			avatarPending = false;
			if (avatarPicker) avatarPicker.value = '';
		}
	}
	async function removeAvatar() {
		if (avatarPending) return;
		avatarPending = true;
		avatarError = '';
		try {
			const response = await fetch('/api/avatar', { method: 'DELETE' });
			if (!response.ok) throw new Error(t(m.avatar_delete_failed));
			avatarPreview = '';
			await authService.refreshSession();
		} catch (error) {
			avatarError = error instanceof Error ? error.message : t(m.avatar_delete_failed);
		} finally {
			avatarPending = false;
		}
	}
	function enter(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void saveAccount();
			(event.currentTarget as HTMLInputElement).blur();
		}
	}
</script>

<Modal title={t(m.settings)} {onclose} closeLabel={t(m.close)} width="32rem" zIndex={1000}>
	<fieldset>
		<legend>{t(m.language)}</legend>
		<div class="choices">
			{#each [['ru', 'Русский'], ['en', 'English'], ['es', 'Español']] as option (option[0])}<button
					class:active={locale === option[0]}
					type="button"
					onclick={() => chooseLocale(option[0] as AppLocale)}>{option[1]}</button
				>{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>{t(m.theme)}</legend>
		<div class="choices">
			{#each [['system', t(m.system)], ['light', t(m.light)], ['dark', t(m.dark)]] as option (option[0])}<button
					class:active={theme === option[0]}
					type="button"
					onclick={() => chooseTheme(option[0] as AppTheme)}>{option[1]}</button
				>{/each}
		</div>
	</fieldset>
	{#if $session.data}<fieldset>
			<legend>{t(m.account)}</legend>
			<div class="fields">
				<div class="avatar-field">
					<UserAvatar name={name || $session.data.user.name} image={avatarPreview} size={72} />
					<div class="avatar-controls">
						<strong>{t(m.avatar)}</strong>
						<div class="avatar-row">
							<input
								class="avatar-picker"
								bind:this={avatarPicker}
								type="file"
								accept="image/jpeg,image/png,image/webp"
								disabled={avatarPending}
								onchange={(event) => {
									const file = event.currentTarget.files?.[0];
									if (file) void uploadAvatar(file);
								}}
							/>
							<button
								class="avatar-action"
								type="button"
								disabled={avatarPending}
								aria-label={avatarPending ? t(m.uploading_image) : t(m.choose_image)}
								title={avatarPending ? t(m.uploading_image) : t(m.choose_image)}
								onclick={() => avatarPicker?.click()}
								>{#if avatarPending}<IconLoader2 class="spin" size={20} />{:else}<IconPhotoUp
										size={20}
									/>{/if}</button
							>
							{#if $session.data.user.image}<button
									class="avatar-action remove-avatar"
									type="button"
									disabled={avatarPending}
									aria-label={t(m.remove_image)}
									title={t(m.remove_image)}
									onclick={() => void removeAvatar()}><IconTrash size={20} /></button
								>{/if}
						</div>
						{#if avatarError}<small class="field-error" role="alert">{avatarError}</small>{/if}
					</div>
				</div>
				<div>
					<Input
						bind:value={name}
						placeholder={t(m.name)}
						autocomplete="name"
						disabled={namePending}
						error={nameError}
						onkeydown={enter}
					/>{#if namePending}<small>{t(m.saving)}</small>{/if}
				</div>
				<div>
					<Input
						bind:value={email}
						placeholder={t(m.email)}
						type="email"
						autocomplete="email"
						disabled={emailPending}
						error={emailError}
						onkeydown={enter}
					/>{#if emailPending}<small>{t(m.saving)}</small>{/if}{#if emailNotice}<small
							class="success">{emailNotice}</small
						>{/if}
				</div>
				<div class="account-actions">
					<button
						type="button"
						disabled={accountPending || !accountChanged}
						aria-label={accountPending ? t(m.saving_changes) : t(m.save)}
						title={accountPending ? t(m.saving_changes) : t(m.save)}
						onclick={() => void saveAccount()}
					>
						{#if accountPending}<IconLoader2 class="spin" size={20} />{:else}<IconDeviceFloppy
								size={20}
							/>{/if}
					</button>
				</div>
			</div>
		</fieldset>{/if}
	{#if $session.data}<fieldset>
			<legend>{t(m.change_password)}</legend>
			<div class="fields">
				<Input
					bind:value={currentPassword}
					placeholder={t(m.current_password)}
					type="password"
					autocomplete="current-password"
					disabled={passwordPending}
					onkeydown={passwordEnter}
				/>
				<Input
					bind:value={newPassword}
					placeholder={t(m.new_password)}
					type="password"
					autocomplete="new-password"
					disabled={passwordPending}
					onkeydown={passwordEnter}
				/>
				<Input
					bind:value={passwordConfirmation}
					placeholder={t(m.repeat_password)}
					type="password"
					autocomplete="new-password"
					disabled={passwordPending}
					error={passwordError}
					onkeydown={passwordEnter}
				/>
				{#if passwordNotice}<small class="success" role="status">{passwordNotice}</small>{/if}
				<div class="password-actions">
					<button type="button" disabled={passwordPending} onclick={() => void savePassword()}>
						{#if passwordPending}<IconLoader2 class="spin" size={20} />{/if}
						{passwordPending ? t(m.saving) : t(m.change_password)}
					</button>
				</div>
			</div>
		</fieldset>{/if}
</Modal>

<style>
	:global(.modal-body) {
		padding: 0.4rem 1.4rem;
	}
	fieldset {
		border: 0;
		border-top: 1px solid var(--color-border);
		margin: 0;
		padding: 1rem 0;
	}
	legend {
		padding-right: 0.5rem;
		font-weight: 700;
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}
	.choices button {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface);
		padding: 0.55rem;
		cursor: pointer;
	}
	.choices button.active {
		border-color: var(--color-accent);
		background: var(--color-surface-hover);
		color: var(--color-accent);
		font-weight: 700;
	}
	.fields {
		display: grid;
		gap: 1rem;
	}
	.fields small {
		display: block;
		margin: 0.25rem;
		color: var(--color-text-muted);
	}
	.fields .success {
		color: var(--color-success);
	}
	.avatar-field {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.avatar-controls {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.35rem;
	}
	.avatar-controls > strong {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		font-weight: 650;
	}
	.avatar-row {
		display: flex;
		gap: 0.4rem;
	}
	.avatar-picker {
		display: none;
	}
	.avatar-row button {
		display: inline-grid;
		place-items: center;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface);
		width: 2.45rem;
		height: 2.45rem;
		padding: 0;
		color: inherit;
		cursor: pointer;
	}
	.avatar-row button:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	.account-actions {
		display: flex;
		justify-content: flex-end;
	}
	.account-actions button {
		display: inline-grid;
		place-items: center;
		width: 2.45rem;
		height: 2.45rem;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface);
		color: var(--color-accent);
		cursor: pointer;
	}
	.account-actions button:disabled {
		color: var(--color-text-muted);
		cursor: default;
		opacity: 0.6;
	}
	.password-actions {
		display: flex;
		justify-content: flex-end;
	}
	.password-actions button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface);
		padding: 0.6rem 0.85rem;
		color: var(--color-accent);
		font-weight: 700;
		cursor: pointer;
	}
	.password-actions button:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	:global(.avatar-action .spin) {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.avatar-row .remove-avatar,
	.field-error {
		color: #9b2929;
	}
	@media (max-width: 520px) {
		.avatar-field,
		.avatar-row {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
