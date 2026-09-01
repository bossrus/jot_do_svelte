<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	import {
		IconCheck,
		IconChevronDown,
		IconCreditCardPay,
		IconPlus,
		IconTrash,
		IconUsers
	} from '@tabler/icons-svelte-runes';
	import { friendsApi, friendErrorMessage } from '$lib/client/friends';
	import {
		getPlanCapabilities,
		isUserPlan,
		PLAN_DEFINITIONS,
		PAID_PLANS,
		type PaidPlan
	} from '$lib/billing/plans';
	import { formatUsd, PLAN_PRICES_USD_CENTS } from '$lib/billing/pricing';
	import type { Friend } from '$lib/friends/contracts';
	import type { TodoAccessParticipant } from '$lib/todos/access-contracts';
	import IconButton from './IconButton.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';
	let {
		friends,
		accessParticipants = [],
		selected,
		groupId,
		label = m.attached_contacts(),
		showContactActions = true,
		compact = false,
		pending = false,
		disabled = false,
		onapply,
		onremove,
		onmessage
	}: {
		friends: Friend[];
		accessParticipants?: TodoAccessParticipant[];
		selected: string[];
		groupId?: string;
		label?: string;
		showContactActions?: boolean;
		compact?: boolean;
		pending?: boolean;
		disabled?: boolean;
		onapply: (userIds: string[]) => Promise<void>;
		onremove: (friend: Friend) => Promise<void>;
		onmessage: (type: 'success' | 'error', message: string) => void;
	} = $props();
	let root = $state<HTMLDivElement>(),
		menuElement = $state<HTMLDivElement>(),
		open = $state(false),
		query = $state(''),
		draft = $state<string[]>([]),
		requestPending = $state(false);
	let menuTop = $state(0),
		menuLeft = $state(0),
		menuWidth = $state(0),
		menuAbove = $state(false);
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		requestAnimationFrame(positionMenu);
		return { destroy: () => node.remove() };
	}
	function positionMenu() {
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const padding = 8;
		const gap = 6;
		menuWidth = compact
			? Math.min(512, window.innerWidth - padding * 2)
			: Math.min(rect.width, window.innerWidth - padding * 2);
		menuLeft = Math.min(
			Math.max(padding, rect.right - menuWidth),
			window.innerWidth - menuWidth - padding
		);
		menuAbove =
			window.innerHeight - rect.bottom < 300 && rect.top > window.innerHeight - rect.bottom;
		menuTop = menuAbove ? rect.top - gap : rect.bottom + gap;
	}
	let paymentFriendId = $state<string | null>(null),
		paymentPlan = $state<PaidPlan>('join'),
		paymentPending = $state(false);
	type ListedUser = TodoAccessParticipant & { friend?: Friend };
	let listedUsers = $derived.by(() => {
		const users = new Map<string, ListedUser>();
		for (const participant of accessParticipants) users.set(participant.userId, participant);
		for (const friend of friends) users.set(friend.userId, { ...friend, friend });
		return [...users.values()];
	});
	let filtered = $derived(
		listedUsers.filter((user) =>
			`${user.name ?? ''} ${user.email}`
				.toLocaleLowerCase('ru')
				.includes(query.trim().toLocaleLowerCase('ru'))
		)
	);
	let allFilteredContactsSelected = $derived(
		filtered.length > 0 && filtered.every((user) => draft.includes(user.userId))
	);
	let attachedNames = $derived(
		selected
			.map((id) => listedUsers.find((user) => user.userId === id))
			.filter((user): user is ListedUser => Boolean(user))
			.map((user) => user.name || user.email)
	);
	function toggleOpen() {
		if (disabled) return;
		if (!open) {
			draft = [...selected];
			query = '';
		}
		open = !open;
		if (open) positionMenu();
	}
	$effect(() => {
		if (!open) return;
		window.addEventListener('resize', positionMenu);
		window.addEventListener('scroll', positionMenu, true);
		return () => {
			window.removeEventListener('resize', positionMenu);
			window.removeEventListener('scroll', positionMenu, true);
		};
	});
	function toggle(id: string) {
		draft = draft.includes(id) ? draft.filter((value) => value !== id) : [...draft, id];
	}
	function toggleAllContacts() {
		const filteredIds = new Set(filtered.map((user) => user.userId));
		draft = allFilteredContactsSelected
			? draft.filter((id) => !filteredIds.has(id))
			: [...new Set([...draft, ...filteredIds])];
	}
	async function apply() {
		await onapply(draft);
		open = false;
	}
	async function sendRequest() {
		const email = query.trim();
		if (!email || requestPending) return;
		requestPending = true;
		try {
			const result = await friendsApi.sendRequest(email, groupId ? [groupId] : []);
			onmessage(
				'success',
				result.result === 'alreadyFriend'
					? m.contact_already_added()
					: result.result === 'alreadyPending'
						? m.request_already_sent()
						: m.request_sent()
			);
			query = '';
		} catch (error) {
			onmessage('error', friendErrorMessage(error));
		} finally {
			requestPending = false;
		}
	}
	async function remove(friend: Friend) {
		if (!confirm(m.remove_contact_confirm({ name: friend.name || friend.email }))) return;
		await onremove(friend);
		draft = draft.filter((id) => id !== friend.userId);
	}
	async function purchase(friend: Friend) {
		if (paymentPending) return;
		paymentPending = true;
		try {
			const response = await fetch('/api/billing/sponsored-payment', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ beneficiaryId: friend.userId, plan: paymentPlan, autoRenew: false })
			});
			await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(m.payment_failed());
			onmessage(
				'success',
				m.plan_paid_for({
					plan: PLAN_DEFINITIONS[paymentPlan].label,
					name: friend.name || friend.email
				})
			);
			friend.plan = paymentPlan;
			paymentFriendId = null;
		} catch (error) {
			onmessage(
				'error',
				error instanceof Error && error.message ? error.message : m.payment_failed()
			);
		} finally {
			paymentPending = false;
		}
	}
</script>

<svelte:window
	onclick={(event) =>
		open &&
		root &&
		!root.contains(event.target as Node) &&
		!menuElement?.contains(event.target as Node) &&
		(open = false)}
/>
<div class="dropdown" class:open bind:this={root}>
	<button
		class="trigger"
		class:compact
		type="button"
		aria-haspopup="dialog"
		aria-expanded={open}
		title={label}
		{disabled}
		aria-disabled={disabled}
		onclick={toggleOpen}
		><IconUsers size={20} />{#if compact}<b>{selected.length}</b>{:else}<span class="trigger-label"
				>{label}</span
			><b>{selected.length}</b><IconChevronDown class="chevron" size={17} />{/if}</button
	>{#if !disabled}<span class="tooltip" role="tooltip"
			>{attachedNames.length ? attachedNames.join(', ') : m.no_attached_contacts()}</span
		>{/if}
	{#if open}<div
			class="menu"
			role="dialog"
			aria-label={m.manage_contacts()}
			bind:this={menuElement}
			use:portal
			style:top={`${menuTop}px`}
			style:left={`${menuLeft}px`}
			style:width={`${menuWidth}px`}
			style:transform={menuAbove ? 'translateY(-100%)' : undefined}
		>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void sendRequest();
				}}
			>
				<Input type="email" placeholder={m.find_or_add_contact()} bind:value={query}
					>{#snippet after()}<IconButton
							icon={IconPlus}
							label={m.add_contact()}
							disabled={!query.trim() || requestPending}
							onclick={() => void sendRequest()}
						/>{/snippet}</Input
				>
			</form>
			{#if filtered.length > 0}<label class="select-all"
					><input
						type="checkbox"
						checked={allFilteredContactsSelected}
						onchange={toggleAllContacts}
					/><span>{m.select_all()}</span></label
				>{/if}
			<div class="contacts">
				{#if filtered.length === 0}<p>
						{friends.length ? m.nothing_found() : m.no_contacts()}
					</p>{:else}{#each filtered as user (user.userId)}<div class="contact-row">
							<label
								><input
									type="checkbox"
									checked={draft.includes(user.userId)}
									onchange={() => toggle(user.userId)}
								/><span
									>{user.name || user.email}<small
										>{user.name ? user.email : ''}{user.friend
											? ''
											: ` · ${m.has_access_suffix()}`}</small
									></span
								></label
							>
							{#if showContactActions && user.friend}<div class="actions">
									{#if !user.friend.plan || !isUserPlan(user.friend.plan) || !getPlanCapabilities(user.friend.plan).canJoinSharedTodo}<button
											class="labeled-icon"
											type="button"
											onclick={() =>
												(paymentFriendId = paymentFriendId === user.userId ? null : user.userId)}
											><IconCreditCardPay size={17} /><span>{m.pay()}</span></button
										>{/if}
									<span class="danger-action"
										><IconButton
											icon={IconTrash}
											label={m.remove_contact()}
											disabled={pending}
											onclick={() => void remove(user.friend!)}
										/></span
									>
								</div>{/if}
							{#if user.friend && paymentFriendId === user.userId}<form
									class="payment"
									onsubmit={(event) => {
										event.preventDefault();
										void purchase(user.friend!);
									}}
								>
									<Select
										ariaLabel={m.plan()}
										bind:value={paymentPlan}
										options={PAID_PLANS.filter(
											(plan) => getPlanCapabilities(plan).canJoinSharedTodo
										).map((plan) => ({
											value: plan,
											label: `${PLAN_DEFINITIONS[plan].label} — ${formatUsd(PLAN_PRICES_USD_CENTS[plan].month)}`
										}))}
									/><button type="submit" disabled={paymentPending}
										>{paymentPending ? '…' : m.pay()}</button
									>
								</form>{/if}
						</div>{/each}{/if}
			</div>
			<button
				class="apply"
				type="button"
				title={m.save_contacts()}
				disabled={pending}
				onclick={() => void apply()}><IconCheck size={19} /><span>{m.save()}</span></button
			>
		</div>{/if}
</div>

<style>
	.dropdown {
		position: relative;
		display: inline-flex;
	}
	.trigger {
		display: flex;
		height: 2.55rem;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid #d4ddd6;
		border-radius: 0.5rem;
		background: #f7faf8;
		padding: 0 0.6rem;
		color: #326a4b;
		cursor: pointer;
	}
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.trigger-label {
		min-width: 0;
		flex: 1;
		text-align: left;
	}
	:global(.trigger .chevron) {
		margin-left: auto;
	}
	.trigger b {
		display: grid;
		min-width: 1.3rem;
		height: 1.3rem;
		place-items: center;
		border-radius: 99px;
		background: #e2ece5;
		font-size: 0.7rem;
	}
	.trigger.compact {
		position: relative;
		width: 3.35rem;
		justify-content: center;
		padding: 0;
		color: var(--color-accent);
		background: #edf5ff;
	}
	.trigger.compact b {
		position: absolute;
		top: 2px;
		right: 3px;
		background: var(--color-accent);
		color: #fff;
	}
	.tooltip {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.45rem);
		z-index: 90;
		width: max-content;
		max-width: 20rem;
		border-radius: 0.45rem;
		background: #18212f;
		padding: 0.45rem 0.6rem;
		color: #fff;
		font-size: 0.75rem;
		line-height: 1.4;
		opacity: 0;
		pointer-events: none;
		transform: translateY(0.2rem);
		transition: 0.12s;
	}
	.dropdown:hover > .tooltip,
	.trigger:focus-visible + .tooltip {
		opacity: 1;
		transform: none;
	}
	.dropdown.open > .tooltip {
		display: none;
	}
	.menu {
		position: fixed;
		z-index: 1000;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		width: min(32rem, calc(100vw - 3rem));
		max-height: 25rem;
		border: 1px solid #d4dbd6;
		border-radius: 0.7rem;
		background: #fff;
		padding: 0.7rem;
		box-shadow: 0 12px 32px rgb(31 45 36 / 18%);
	}
	.contacts {
		min-height: 3rem;
		max-height: 200px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-block: 1px solid #e3e7e4;
	}
	.contact-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		border-bottom: 1px solid #edf0ed;
		padding: 0.4rem 0.2rem;
	}
	.select-all {
		display: flex;
		min-height: 2.55rem;
		align-items: center;
		gap: 0.55rem;
		border-block: 1px solid #dfe5e0;
		padding: 0 0.2rem;
		color: #326a4b;
		font-size: 0.84rem;
		font-weight: 700;
		cursor: pointer;
	}
	.contact-row:last-child {
		border: 0;
	}
	.contact-row > label {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
	}
	.contact-row label > span {
		display: grid;
		min-width: 0;
		font-size: 0.84rem;
	}
	.contact-row small {
		overflow: hidden;
		color: #69746c;
		font-size: 0.74rem;
		text-overflow: ellipsis;
	}
	.contacts p {
		color: #7a857d;
		font-size: 0.8rem;
		text-align: center;
	}
	.contacts input {
		accent-color: #326a4b;
	}
	.actions {
		display: flex;
		gap: 0.25rem;
	}
	.labeled-icon {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid #d4ddd6;
		border-radius: 0.4rem;
		background: #fff;
		padding: 0.38rem 0.48rem;
		color: #326a4b;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.danger-action :global(button) {
		color: #9b2929;
	}
	.labeled-icon:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.payment {
		display: flex;
		width: 100%;
		gap: 0.35rem;
		padding: 0.25rem 0;
	}
	.payment :global(.select) {
		min-width: 0;
		flex: 1;
	}
	.payment button {
		border: 0;
		border-radius: 0.4rem;
		background: var(--color-accent);
		color: #fff;
	}
	.apply {
		display: flex;
		width: auto;
		height: 2.55rem;
		align-items: center;
		gap: 0.35rem;
		margin: 0.6rem 0 0 auto;
		border: 0;
		border-radius: 0.55rem;
		background: var(--color-accent);
		padding: 0 0.75rem;
		color: #fff;
		cursor: pointer;
	}
	.apply:disabled {
		opacity: 0.5;
	}
</style>
