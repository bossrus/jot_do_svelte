<script lang="ts">
	import { authService, session } from '$lib/client/auth';
	import IconButton from './IconButton.svelte';
	import {
		IconLogin,
		IconLogout,
		IconMailExclamation,
		IconRepeat,
		IconSettings,
		IconUsers
	} from '@tabler/icons-svelte-runes';
	import FriendsModal from './FriendsModal.svelte';
	import TodoAccessRequestsModal from './TodoAccessRequestsModal.svelte';
	import { todoInvitesApi } from '$lib/client/todo-invites';
	import { friendRequestsState } from '$lib/client/friend-requests-state';
	import { getPlanCapabilities, isUserPlan } from '$lib/billing/plans';
	import RecurringTodosModal from './RecurringTodosModal.svelte';
	import NotificationCenter from './NotificationCenter.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import UserAvatar from './UserAvatar.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeState, localeVersion, type AppLocale } from '$lib/client/locale';
	$localeVersion;
	function t<I extends object>(
		message: (inputs: I, options?: { locale?: AppLocale }) => string,
		inputs = {} as I
	) {
		return message(inputs, { locale: $localeState });
	}
	import { notificationsApi } from '$lib/client/notifications';
	let { onlogin }: { onlogin: () => void } = $props();
	let verificationOpen = $state(false);
	let resendPending = $state(false);
	let resendMessage = $state('');
	let friendsOpen = $state(false);
	let accessRequestsOpen = $state(false);
	let recurringOpen = $state(false);
	let settingsOpen = $state(false);
	let accessRequestCount = $state(0);
	let canShareTodo = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canShareTodo
	);
	let canUseRecurring = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canUseRecurringTodos
	);

	$effect(() => {
		if (!$session.data) {
			friendRequestsState.clear();
			notificationsApi.clear();
			return;
		}
		void friendRequestsState.refresh();
		void notificationsApi.refresh();
		if (canShareTodo) void refreshAccessRequests();
		const refresh = () => void friendRequestsState.refresh();
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') refresh();
		};
		window.addEventListener('friend-request.changed', refresh);
		window.addEventListener('notifications.changed', notificationsApi.refresh);
		window.addEventListener('notification.open-friends', openFriends);
		window.addEventListener('todo-access-request.changed', refreshAccessRequests);
		window.addEventListener('online', refresh);
		window.addEventListener('online', notificationsApi.refresh);
		window.addEventListener('focus', refreshWhenVisible);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		return () => {
			window.removeEventListener('friend-request.changed', refresh);
			window.removeEventListener('notifications.changed', notificationsApi.refresh);
			window.removeEventListener('notification.open-friends', openFriends);
			window.removeEventListener('todo-access-request.changed', refreshAccessRequests);
			window.removeEventListener('online', refresh);
			window.removeEventListener('online', notificationsApi.refresh);
			window.removeEventListener('focus', refreshWhenVisible);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
		};
	});
	function openFriends() {
		friendsOpen = true;
	}
	async function refreshAccessRequests() {
		try {
			accessRequestCount = (await todoInvitesApi.pending()).requests.length;
		} catch {
			accessRequestCount = 0;
		}
	}

	async function resendVerification() {
		const email = $session.data?.user.email;
		if (!email || resendPending) return;
		resendPending = true;
		resendMessage = '';
		const result = await authService.resendVerification(email);
		resendPending = false;
		resendMessage = result.error ? t(m.mail_failed) : t(m.mail_sent);
	}
</script>

<header class="app-header">
	<div>
		<p class="eyebrow">{t(m.local_first)}</p>
		<h1>JotDO</h1>
	</div>
	<div class="account">
		{#if $session.data}
			<IconButton
				icon={IconSettings}
				label={t(m.settings)}
				active={settingsOpen}
				onclick={() => (settingsOpen = true)}
			/>
			<NotificationCenter />
			<IconButton
				icon={IconRepeat}
				label={t(m.recurring)}
				active={recurringOpen}
				onclick={() => (recurringOpen = true)}
			/>
			{#if canShareTodo}<div class="friends-button">
					<button
						class="request-button"
						type="button"
						aria-label={t(m.access_requests)}
						onclick={() => (accessRequestsOpen = true)}>🔗</button
					>
					{#if accessRequestCount > 0}<span
							class="badge"
							aria-label={t(m.access_requests_count, { count: accessRequestCount })}
							>{accessRequestCount}</span
						>{/if}
				</div>{/if}
			<div class="friends-button">
				<IconButton
					icon={IconUsers}
					label={t(m.friends)}
					active={friendsOpen}
					onclick={() => (friendsOpen = true)}
				/>
				{#if $friendRequestsState.incoming.length > 0}
					<span
						class="badge"
						aria-label={t(m.incoming_requests, { count: $friendRequestsState.incoming.length })}
						>{$friendRequestsState.incoming.length}</span
					>
				{/if}
			</div>
			{#if !$session.data.user.emailVerified}
				<div class="verification">
					<IconButton
						icon={IconMailExclamation}
						label={t(m.email_unverified)}
						active={verificationOpen}
						onclick={() => (verificationOpen = !verificationOpen)}
					/>
					{#if verificationOpen}
						<div class="verification-popover">
							<strong>{t(m.email_unverified)}</strong>
							<small>{$session.data.user.email}</small>
							<button
								type="button"
								disabled={resendPending}
								onclick={() => void resendVerification()}
							>
								{resendPending ? t(m.sending) : t(m.send_again)}
							</button>
							{#if resendMessage}<p role="status">{resendMessage}</p>{/if}
						</div>
					{/if}
				</div>
			{/if}
			<UserAvatar name={$session.data.user.name} image={$session.data.user.image} size={34} />
			<span
				><strong>{$session.data.user.name}</strong>{#if $session.data.user.publicId}<small
						>{$session.data.user.publicId}</small
					>{/if}</span
			>
			<IconButton
				icon={IconLogout}
				label={t(m.logout)}
				onclick={() => void authService.signOut()}
			/>
		{:else}<IconButton
				icon={IconSettings}
				label={t(m.settings)}
				active={settingsOpen}
				onclick={() => (settingsOpen = true)}
			/><IconButton icon={IconLogin} label={t(m.login)} onclick={onlogin} />{/if}
	</div>
</header>
{#if friendsOpen}<FriendsModal onclose={() => (friendsOpen = false)} />{/if}
{#if accessRequestsOpen}<TodoAccessRequestsModal
		onclose={() => (accessRequestsOpen = false)}
		onchange={refreshAccessRequests}
	/>{/if}
{#if recurringOpen}<RecurringTodosModal
		available={canUseRecurring}
		onclose={() => (recurringOpen = false)}
	/>{/if}
{#if settingsOpen}<SettingsModal onclose={() => (settingsOpen = false)} />{/if}

<style>
	.app-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}
	.eyebrow {
		margin: 0 0 0.3rem;
		color: #647168;
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.14em;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 6vw, 2.5rem);
		letter-spacing: -0.045em;
	}
	.account {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: #59665d;
	}
	.account span {
		display: grid;
		max-width: 11rem;
		line-height: 1.15;
	}
	.account strong {
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 0.82rem;
	}
	.account small {
		font-size: 0.68rem;
		color: #7a857d;
	}
	.verification {
		position: relative;
	}
	.friends-button {
		position: relative;
	}
	.request-button {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border: 0;
		border-radius: 0.45rem;
		background: transparent;
		cursor: pointer;
		font-size: 1rem;
	}
	.badge {
		position: absolute;
		right: -0.2rem;
		top: -0.3rem;
		min-width: 1.1rem;
		height: 1.1rem;
		display: grid;
		place-items: center;
		border: 2px solid #f6f7f4;
		border-radius: 999px;
		background: #b42318;
		color: white;
		font-size: 0.62rem;
		font-weight: 800;
		padding: 0 0.2rem;
	}
	.verification-popover {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		z-index: 40;
		display: grid;
		width: min(18rem, calc(100vw - 2rem));
		gap: 0.55rem;
		border: 1px solid #d2dad4;
		border-radius: 0.6rem;
		background: white;
		padding: 0.85rem;
		box-shadow: 0 12px 35px rgb(20 35 25 / 0.16);
	}
	.verification-popover small {
		overflow-wrap: anywhere;
	}
	.verification-popover button {
		border: 0;
		border-radius: 0.45rem;
		background: #326a4b;
		color: white;
		padding: 0.58rem 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}
	.verification-popover button:disabled {
		opacity: 0.6;
	}
	.verification-popover p {
		margin: 0;
		color: #59665d;
		font-size: 0.78rem;
	}
</style>
