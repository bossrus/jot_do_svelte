<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { IconCheck, IconCreditCardPay, IconPlus, IconTrash } from '@tabler/icons-svelte-runes';
	import { friendErrorMessage, friendsApi } from '$lib/client/friends';
	import { friendRequestsState } from '$lib/client/friend-requests-state';
	import type { Friend, FormerFriend, FriendGroup } from '$lib/friends/contracts';
	import IconButton from './IconButton.svelte';
	import ContactGroupsDropdown from './ContactGroupsDropdown.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';
	import AlertMessages, { type AlertMessage } from './AlertMessages.svelte';
	import Modal from './Modal.svelte';
	import { session } from '$lib/client/auth';
	import {
		getPlanCapabilities,
		isUserPlan,
		PLAN_DEFINITIONS,
		PAID_PLANS,
		type PaidPlan
	} from '$lib/billing/plans';
	import { formatUsd, PLAN_PRICES_USD_CENTS } from '$lib/billing/pricing';
	import { loadPaddle } from '$lib/billing/paddle-client';
	import { m } from '$lib/paraglide/messages';
	import { currentLocale, localeVersion } from '$lib/client/locale';
	$localeVersion;

	let { onclose }: { onclose: () => void } = $props();
	let friends = $state<Friend[]>([]);
	let formerFriends = $state<FormerFriend[]>([]);
	let groups = $state<FriendGroup[]>([]);
	let email = $state('');
	let selectedFriendIds = $state<string[]>([]);
	let groupPending = $state(false);
	let loading = $state(true);
	let loadError = $state('');
	let pending = $state(false);
	let removing = $state<string | null>(null);
	let removalFriend = $state<Friend | null>(null);
	let removalReason = $state('');
	let removalInput = $state<HTMLInputElement>();
	let acting = $state<string | null>(null);
	let paymentFriendId = $state<string | null>(null);
	let paymentPlan = $state<PaidPlan>('join');
	let paymentAutoRenew = $state(false);
	let paymentPending = $state(false);
	let alerts = $state<AlertMessage[]>([]);
	let nextAlertId = 1;
	let canManageGroups = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canManageGroups
	);
	let emailVerified = $derived(Boolean($session.data?.user.emailVerified));
	let canUseContacts = $derived(
		emailVerified &&
			isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canShareTodo
	);
	let unavailableMessage = $derived(
		!emailVerified ? m.contacts_email_required() : !canUseContacts ? m.contacts_plan_required() : ''
	);

	onMount(() => {
		if (canUseContacts) void load();
		else loading = false;
		const refreshFriendLists = () => void load(false);
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') void load(false);
		};
		const refreshTimer = window.setInterval(refreshWhenVisible, 15_000);
		window.addEventListener('friend-request.changed', refreshFriendLists);
		window.addEventListener('focus', refreshWhenVisible);
		document.addEventListener('visibilitychange', refreshWhenVisible);
		return () => {
			window.clearInterval(refreshTimer);
			window.removeEventListener('friend-request.changed', refreshFriendLists);
			window.removeEventListener('focus', refreshWhenVisible);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
		};
	});

	async function load(showLoading = true, refreshRequests = true) {
		if (!canUseContacts) return;
		if (showLoading) loading = true;
		loadError = '';
		try {
			const [active, former, groupList] = await Promise.all([
				friendsApi.list(),
				friendsApi.listFormer(),
				canManageGroups ? friendsApi.listGroups() : Promise.resolve({ groups: [] }),
				refreshRequests ? friendRequestsState.refresh() : Promise.resolve()
			]);
			friends = active.friends;
			groups = groupList.groups;
			const activeIds = new Set(active.friends.map((friend) => friend.userId));
			formerFriends = former.formerFriends.filter((friend) => !activeIds.has(friend.userId));
		} catch {
			loadError = m.contacts_load_failed();
		} finally {
			if (showLoading) loading = false;
		}
	}

	async function addFriend() {
		const value = email.trim();
		if (!value || pending) return;
		pending = true;
		try {
			const result = await friendsApi.sendRequest(value);
			if (result.result === 'alreadyFriend') showAlert('success', m.contact_already_added());
			else {
				showAlert(
					'success',
					result.result === 'alreadyPending' ? m.request_already_sent() : m.request_sent()
				);
				email = '';
				await friendRequestsState.refresh();
			}
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			pending = false;
		}
	}

	async function act(id: string, action: 'allow' | 'mutual' | 'reject' | 'cancel') {
		if (acting) return;
		acting = id;
		try {
			if (action === 'allow') await friendsApi.accept(id, false);
			if (action === 'mutual') await friendsApi.accept(id, true);
			if (action === 'reject') await friendsApi.reject(id);
			if (action === 'cancel') await friendsApi.cancel(id);
			showAlert(
				'success',
				action === 'reject'
					? m.request_rejected()
					: action === 'cancel'
						? m.request_cancelled()
						: m.request_accepted()
			);
			await load();
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			acting = null;
		}
	}

	function toggle(ids: string[], id: string) {
		return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
	}

	async function createGroup(name: string) {
		if (!name.trim() || groupPending) return;
		groupPending = true;
		try {
			const group = await friendsApi.createGroup(name);
			groups = [...groups, group].sort((a, b) => a.name.localeCompare(b.name, currentLocale()));
			showAlert('success', m.group_created_named({ name: group.name }));
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}

	async function renameGroup(group: FriendGroup, name: string) {
		if (!name.trim() || groupPending) return;
		groupPending = true;
		try {
			const updated = await friendsApi.renameGroup(group.id, name);
			groups = groups.map((item) => (item.id === group.id ? updated : item));
			showAlert('success', m.group_renamed_named({ name: updated.name }));
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}

	async function removeGroup(group: FriendGroup) {
		if (groupPending) return;
		groupPending = true;
		try {
			await friendsApi.removeGroup(group.id);
			groups = groups.filter((item) => item.id !== group.id);
			showAlert('success', m.group_removed_named({ name: group.name }));
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}

	async function copyGroup(group: FriendGroup, name: string) {
		if (groupPending) return;
		groupPending = true;
		try {
			const created = await friendsApi.createGroup(name);
			await Promise.all(
				group.memberUserIds.map((userId) => {
					const current = groups
						.filter((item) => item.memberUserIds.includes(userId))
						.map((item) => item.id);
					return friendsApi.setFriendGroups(userId, [...current, created.id]);
				})
			);
			groups = [...groups, { ...created, memberUserIds: [...group.memberUserIds] }].sort((a, b) =>
				a.name.localeCompare(b.name, currentLocale())
			);
			showAlert('success', m.group_created_named({ name: created.name }));
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}

	async function applyGroups(groupIds: string[]) {
		if (groupPending || selectedFriendIds.length === 0) return;
		groupPending = true;
		const contactNames = selectedFriendIds
			.map((id) => friends.find((friend) => friend.userId === id))
			.filter((friend): friend is Friend => Boolean(friend))
			.map((friend) => friend.name || friend.email);
		const groupNames = groupIds
			.map((id) => groups.find((group) => group.id === id)?.name)
			.filter((name): name is string => Boolean(name));
		try {
			await Promise.all(
				selectedFriendIds.map((userId) => {
					const current = groups
						.filter((group) => group.memberUserIds.includes(userId))
						.map((group) => group.id);
					return friendsApi.setFriendGroups(userId, [...new Set([...current, ...groupIds])]);
				})
			);
			groups = groups.map((group) =>
				groupIds.includes(group.id)
					? {
							...group,
							memberUserIds: [...new Set([...group.memberUserIds, ...selectedFriendIds])]
						}
					: group
			);
			selectedFriendIds = [];
			showAlert(
				'success',
				m.groups_assigned({ contacts: contactNames.join(', '), groups: groupNames.join(', ') })
			);
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}

	async function setContactGroups(friend: Friend, groupIds: string[]) {
		if (groupPending) return;
		groupPending = true;
		try {
			await friendsApi.setFriendGroups(friend.userId, groupIds);
			groups = groups.map((group) => ({
				...group,
				memberUserIds: groupIds.includes(group.id)
					? [...new Set([...group.memberUserIds, friend.userId])]
					: group.memberUserIds.filter((id) => id !== friend.userId)
			}));
			const names = groupIds
				.map((id) => groups.find((group) => group.id === id)?.name)
				.filter((name): name is string => Boolean(name));
			showAlert(
				'success',
				names.length
					? m.contact_groups_assigned({
							contact: friend.name || friend.email,
							groups: names.join(', ')
						})
					: m.contact_groups_cleared({ contact: friend.name || friend.email })
			);
		} catch (error) {
			showAlert('error', friendErrorMessage(error));
		} finally {
			groupPending = false;
		}
	}
	function showAlert(type: AlertMessage['type'], message: string) {
		alerts = [...alerts, { id: nextAlertId++, type, message }];
	}
	function closeAlert(id: number) {
		alerts = alerts.filter((alert) => alert.id !== id);
	}

	async function askToRemoveFriend(friend: Friend) {
		removalFriend = friend;
		removalReason = '';
		await Promise.resolve();
		removalInput?.focus();
	}

	function cancelRemoveFriend() {
		if (removing) return;
		removalFriend = null;
		removalReason = '';
	}

	async function removeFriend(friend: Friend, reason = '') {
		if (removing) return;
		removing = friend.userId;
		try {
			const result = await friendsApi.remove(friend.userId, reason);
			if (result.removed) {
				friends = friends.filter((item) => item.userId !== friend.userId);
				groups = groups.map((group) => ({
					...group,
					memberUserIds: group.memberUserIds.filter((id) => id !== friend.userId)
				}));
				formerFriends = [
					{
						userId: friend.userId,
						email: friend.email,
						name: friend.name,
						removedAt: new Date().toISOString(),
						reason: null
					},
					...formerFriends.filter((item) => item.userId !== friend.userId)
				];
				removalFriend = null;
				removalReason = '';
				showAlert('success', m.contact_removed_named({ name: friend.name || friend.email }));
			}
		} catch {
			showAlert('error', m.contact_remove_failed());
		} finally {
			removing = null;
		}
	}

	async function purchaseForFriend(friend: Friend) {
		if (paymentPending) return;
		paymentPending = true;
		try {
			const response = await fetch('/api/billing/sponsored-payment', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					beneficiaryId: friend.userId,
					plan: paymentPlan,
					autoRenew: paymentAutoRenew
				})
			});
			const result = (await response.json().catch(() => ({}))) as {
				transactionId?: string;
				message?: string;
			};
			if (!response.ok || !result.transactionId)
				throw new Error(result.message || m.payment_failed());
			const token = env.PUBLIC_PADDLE_CLIENT_TOKEN;
			if (!token) throw new Error(m.payment_failed());
			const paddle = await loadPaddle(token, (event) => {
				if (event.name !== 'checkout.completed') return;
				showAlert(
					'success',
					m.plan_paid_for({
						plan: PLAN_DEFINITIONS[paymentPlan].label,
						name: friend.name || friend.email
					})
				);
				paymentFriendId = null;
				window.setTimeout(() => void load(false), 1500);
			});
			paddle.Checkout.open({
				transactionId: result.transactionId,
				customer: $session.data?.user.email ? { email: $session.data.user.email } : undefined,
				settings: { displayMode: 'overlay', theme: 'light', successUrl: `${location.origin}/app` }
			});
		} catch (error) {
			showAlert('error', error instanceof Error ? error.message : m.payment_failed());
		} finally {
			paymentPending = false;
		}
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium' }).format(
			new Date(value)
		);
	}

	function formerContact(userId: string) {
		return formerFriends.find((friend) => friend.userId === userId);
	}
</script>

<Modal title={m.friends()} {onclose} width="40rem" maxHeight="min(46rem, calc(100dvh - 2rem))">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void addFriend();
		}}
	>
		<Input
			type="email"
			autocomplete="email"
			placeholder={unavailableMessage || m.add_contact()}
			bind:value={email}
			readonly={Boolean(unavailableMessage)}
		>
			{#snippet after()}<IconButton
					icon={IconPlus}
					label={pending ? m.sending_request() : m.add()}
					disabled={!email.trim() || pending}
					onclick={() => void addFriend()}
				/>{/snippet}
		</Input>
	</form>
	{#if canUseContacts}<div class="content" aria-live="polite" aria-busy={loading}>
			{#if loading}
				<p class="empty">{m.loading_contacts()}</p>
			{:else if loadError}
				<div class="load-error">
					<p role="alert">{loadError}</p>
					<button type="button" title={m.retry_load()} onclick={() => void load()}
						>{m.retry()}</button
					>
				</div>
			{:else}
				<section aria-labelledby="incoming-requests-title">
					<h3 id="incoming-requests-title">{m.incoming_requests_title()}</h3>
					{#if $friendRequestsState.incoming.length === 0}<p class="empty compact">
							{m.no_incoming_requests()}
						</p>{:else}
						<ul>
							{#each $friendRequestsState.incoming as request (request.id)}<li class="request-item">
									<div class="request-info">
										{#if request.sender.name}<strong>{request.sender.name}</strong>{/if}<span
											>{request.sender.email}</span
										>
										<small class="request-status">{m.awaiting_confirmation()}</small>
										{#if formerContact(request.sender.userId)}
											<small class="former-warning"
												>{m.former_contact_reason({
													reason:
														formerContact(request.sender.userId)?.reason || m.reason_not_provided()
												})}</small
											>
										{/if}
									</div>
									<div class="request-actions">
										<button
											type="button"
											title={m.allow_contact()}
											disabled={acting !== null}
											onclick={() => void act(request.id, 'allow')}>{m.allow_contact()}</button
										>
										<button
											class="primary small"
											type="button"
											title={m.allow_and_add_contact()}
											disabled={acting !== null}
											onclick={() => void act(request.id, 'mutual')}
											>{m.allow_and_add_contact()}</button
										>
										<button
											class="danger"
											type="button"
											title={m.reject_request()}
											disabled={acting !== null}
											onclick={() => void act(request.id, 'reject')}>{m.reject_request()}</button
										>
									</div>
								</li>{/each}
						</ul>
					{/if}
				</section>

				<section class="separated" aria-labelledby="outgoing-requests-title">
					<h3 id="outgoing-requests-title">{m.outgoing_requests_title()}</h3>
					{#if $friendRequestsState.outgoing.length === 0}<p class="empty compact">
							{m.no_pending_requests()}
						</p>{:else}
						<ul>
							{#each $friendRequestsState.outgoing as request (request.id)}<li>
									<div class="request-info">
										{#if request.recipient.name}<strong>{request.recipient.name}</strong>{/if}<span
											>{request.recipient.email}</span
										>
										<small class="request-status">{m.awaiting_confirmation()}</small>
										{#if formerContact(request.recipient.userId)}
											<small class="former-warning"
												>{m.former_contact_reason({
													reason:
														formerContact(request.recipient.userId)?.reason ||
														m.reason_not_provided()
												})}</small
											>
										{/if}
									</div>
									<button
										class="danger"
										type="button"
										title={m.cancel_outgoing_request()}
										disabled={acting !== null}
										onclick={() => void act(request.id, 'cancel')}>{m.cancel()}</button
									>
								</li>{/each}
						</ul>
					{/if}
				</section>

				<section class="separated" aria-labelledby="active-friends-title">
					<h3 id="active-friends-title">{m.active_contacts()}</h3>
					{#if canManageGroups && friends.length > 0}
						<ContactGroupsDropdown
							{groups}
							{friends}
							{selectedFriendIds}
							pending={groupPending}
							oncreate={createGroup}
							onrename={renameGroup}
							onremove={removeGroup}
							oncopy={copyGroup}
							onapply={applyGroups}
						/>
					{/if}
					{#if friends.length === 0}
						<p class="empty">{m.empty_contacts()}</p>
					{:else}
						<ul>
							{#each friends as friend (friend.userId)}
								<li class="contact-item">
									<input
										class="contact-check"
										type="checkbox"
										aria-label={m.select_named({ name: friend.name || friend.email })}
										checked={selectedFriendIds.includes(friend.userId)}
										onchange={() => (selectedFriendIds = toggle(selectedFriendIds, friend.userId))}
									/>
									<div>
										{#if friend.name}<strong>{friend.name}</strong>{/if}<span>{friend.email}</span>
									</div>
									<div class="contact-actions">
										{#if canManageGroups}<ContactGroupsDropdown
												{groups}
												{friends}
												selectedFriendIds={[friend.userId]}
												initialSelectedGroupIds={groups
													.filter((group) => group.memberUserIds.includes(friend.userId))
													.map((group) => group.id)}
												compact
												placement="top-right"
												pending={groupPending}
												oncreate={createGroup}
												onrename={renameGroup}
												onremove={removeGroup}
												oncopy={copyGroup}
												onapply={(ids) => setContactGroups(friend, ids)}
											/>{/if}{#if !friend.plan || !isUserPlan(friend.plan) || !getPlanCapabilities(friend.plan).canJoinSharedTodo}<IconButton
												icon={IconCreditCardPay}
												label={m.pay_plan_for({ name: friend.name || friend.email })}
												onclick={() => {
													paymentFriendId =
														paymentFriendId === friend.userId ? null : friend.userId;
												}}
											/><IconButton
												icon={IconTrash}
												label={m.delete_named({ name: friend.email })}
												disabled={removing !== null}
												onclick={() => void askToRemoveFriend(friend)}
											/>{/if}
									</div>
									{#if paymentFriendId === friend.userId}<form
											class="payment-panel"
											onsubmit={(event) => {
												event.preventDefault();
												void purchaseForFriend(friend);
											}}
										>
											<label
												>{m.plan()}<Select
													ariaLabel={m.plan()}
													bind:value={paymentPlan}
													options={PAID_PLANS.filter(
														(plan) => getPlanCapabilities(plan).canJoinSharedTodo
													).map((plan) => ({
														value: plan,
														label: `${PLAN_DEFINITIONS[plan].label} — ${formatUsd(PLAN_PRICES_USD_CENTS[plan].month)}${m.per_month_short()}`
													}))}
												/></label
											>
											<label class="renew"
												><input
													type="checkbox"
													bind:checked={paymentAutoRenew}
												/>{m.auto_renew_monthly()}</label
											>
											<div class="payment-actions">
												<button
													type="button"
													title={m.close_payment()}
													onclick={() => (paymentFriendId = null)}>{m.cancel()}</button
												><button
													class="primary"
													type="submit"
													title={m.pay_for_plan({ plan: PLAN_DEFINITIONS[paymentPlan].label })}
													disabled={paymentPending}
													>{paymentPending
														? m.processing()
														: m.pay_amount({
																amount: formatUsd(PLAN_PRICES_USD_CENTS[paymentPlan].month)
															})}</button
												>
											</div>
										</form>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				{#if formerFriends.length > 0}
					<section class="former" aria-labelledby="former-friends-title">
						<h3 id="former-friends-title">{m.former_contacts()}</h3>
						<ul>
							{#each formerFriends as friend (friend.userId)}
								<li>
									<div>
										{#if friend.name}<strong>{friend.name}</strong>{/if}<span>{friend.email}</span>
									</div>
									<small
										>{formatDate(friend.removedAt)}{#if friend.reason}
											· {friend.reason}{/if}</small
									>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</div>{/if}
</Modal>
{#if removalFriend}
	<div
		class="reason-backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && cancelRemoveFriend()}
		onkeydown={(event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				cancelRemoveFriend();
			}
		}}
	>
		<div
			class="reason-dialog"
			role="dialog"
			aria-modal="true"
			aria-label={m.removal_reason_label()}
		>
			<form
				class="reason-form"
				onsubmit={(event) => {
					event.preventDefault();
					void removeFriend(removalFriend!, removalReason);
				}}
			>
				<div class="reason-input">
					<Input
						placeholder={m.optional_reason()}
						bind:value={removalReason}
						bind:inputRef={removalInput}
						maxlength={500}
						disabled={removing !== null}
					>
						{#snippet after()}
							<IconButton
								icon={IconCheck}
								label={m.confirm_removal()}
								disabled={removing !== null}
								onclick={() => void removeFriend(removalFriend!, removalReason)}
							/>
						{/snippet}
					</Input>
				</div>
			</form>
		</div>
	</div>
{/if}
<AlertMessages {alerts} onclose={closeAlert} />

<style>
	:global(.modal-body) {
		padding: 1.5rem;
	}
	h3 {
		margin: 0 0 0.65rem;
		color: #465149;
		font-size: 0.86rem;
	}
	form {
		display: grid;
		gap: 0.35rem;
	}
	label {
		color: #465149;
		font-size: 0.82rem;
		font-weight: 650;
	}
	input {
		min-width: 0;
		flex: 1;
		border: 1px solid #cbd3cd;
		border-radius: 0.48rem;
		padding: 0.68rem 0.75rem;
		font: inherit;
	}
	input[type='checkbox'] {
		min-width: auto;
		flex: none;
		margin: 0;
		accent-color: #326a4b;
	}
	.primary {
		border: 0;
		border-radius: 0.5rem;
		background: #326a4b;
		color: white;
		padding: 0.68rem 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.content {
		margin-top: 1.25rem;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid #e0e4e0;
		padding: 0.65rem 0;
	}
	.contact-item {
		flex-wrap: wrap;
	}
	.contact-item > div:first-of-type {
		flex: 1;
	}
	.contact-check {
		flex: none;
	}
	.contact-actions {
		display: flex !important;
		align-items: center;
		gap: 0.4rem;
	}
	.payment-panel {
		display: grid;
		width: 100%;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
		gap: 0.75rem;
		border: 1px solid #dbe3ee;
		border-radius: 0.7rem;
		background: #f8fbff;
		padding: 0.85rem;
	}
	.payment-panel label {
		display: grid;
		gap: 0.35rem;
	}
	.payment-panel :global(.select) {
		height: 40px;
		border: 1px solid #cbd5e1;
		border-radius: 0.45rem;
		background: #fff;
		padding: 0 0.55rem;
	}
	.payment-panel .renew {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
	}
	.payment-panel .renew input {
		flex: none;
	}
	.payment-actions {
		display: flex !important;
		grid-column: 1/-1;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.payment-actions button {
		border: 1px solid #cbd3cd;
		border-radius: 0.45rem;
		background: #fff;
		padding: 0.55rem 0.75rem;
		cursor: pointer;
	}
	.payment-actions .primary {
		border-color: var(--color-accent);
		background: var(--color-accent);
	}
	li div {
		display: grid;
		min-width: 0;
	}
	li strong,
	li span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	li strong {
		font-size: 0.88rem;
	}
	li span {
		color: #69746c;
		font-size: 0.8rem;
	}
	.empty {
		margin: 1rem 0;
		color: #7a857d;
		text-align: center;
	}
	.compact {
		margin: 0.55rem 0;
		text-align: left;
		font-size: 0.82rem;
	}
	.separated {
		margin-top: 1.35rem;
		border-top: 1px solid #d9ded9;
		padding-top: 1rem;
	}
	.request-item {
		align-items: flex-start;
		flex-direction: column;
	}
	.request-info {
		gap: 0.2rem;
	}
	.request-status {
		display: block;
		margin-top: 0.25rem;
		color: #7a857d;
		font-size: 0.72rem;
	}
	.former-warning {
		display: block;
		margin-top: 0.2rem;
		color: #7a857d;
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.request-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		width: 100%;
	}
	.request-actions button,
	button.danger {
		border: 1px solid #cbd3cd;
		border-radius: 0.42rem;
		background: white;
		padding: 0.42rem 0.55rem;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.request-actions .small {
		border: 0;
		background: #326a4b;
	}
	.request-actions .danger,
	button.danger {
		color: #9b2929;
	}
	.request-actions button:disabled,
	button.danger:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.load-error {
		display: grid;
		justify-items: center;
		color: #9b2929;
	}
	.load-error button {
		border: 0;
		background: transparent;
		color: #326a4b;
		text-decoration: underline;
		cursor: pointer;
	}
	.former {
		margin-top: 1.35rem;
		border-top: 1px solid #d9ded9;
		padding-top: 1rem;
	}
	.former li {
		align-items: end;
	}
	.former small {
		flex: none;
		color: #7a857d;
		font-size: 0.72rem;
	}
	.reason-backdrop {
		position: fixed;
		inset: 0;
		z-index: 700;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(15 25 19 / 42%);
	}
	.reason-dialog {
		display: grid;
		width: min(22rem, 100%);
		border: 1px solid #dce1dc;
		border-radius: 0.75rem;
		background: white;
		padding: 1.2rem;
		box-shadow: 0 18px 50px rgb(10 15 11 / 28%);
	}
	.reason-form {
		display: grid;
	}
	.reason-input {
		min-width: 0;
		flex: 1;
	}
	.reason-input :global(.field) {
		min-height: 3rem;
	}
	.reason-input :global(.control) {
		height: 2.95rem;
	}
	.reason-input :global(.control input) {
		padding-left: 0.9rem;
	}
	@media (max-width: 430px) {
		.former li {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
