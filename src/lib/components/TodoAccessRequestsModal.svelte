<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { friendsApi } from '$lib/client/friends';
	import { todoInvitesApi } from '$lib/client/todo-invites';
	import type { FriendGroup } from '$lib/friends/contracts';
	import type { TodoAccessRequest } from '$lib/todos/invite-contracts';
	import FriendGroupPicker from './FriendGroupPicker.svelte';
	import Modal from './Modal.svelte';
	import { session } from '$lib/client/auth';
	import { getPlanCapabilities, isUserPlan, PLAN_DEFINITIONS } from '$lib/billing/plans';
	import { PAID_PLANS, type PaidPlan } from '$lib/billing/plans';
	import { formatUsd, PLAN_PRICES_USD_CENTS } from '$lib/billing/pricing';
	import { loadPaddle } from '$lib/billing/paddle-client';
	import {
		IconAddressBook,
		IconCheck,
		IconCreditCardPay,
		IconUserCheck,
		IconX
	} from '@tabler/icons-svelte-runes';
	import IconButton from './IconButton.svelte';
	import Select from './Select.svelte';
	import { m } from '$lib/paraglide/messages';
	import { localeVersion } from '$lib/client/locale';
	$localeVersion;
	let { onclose, onchange }: { onclose: () => void; onchange?: () => void } = $props();
	let requests = $state<TodoAccessRequest[]>([]),
		groups = $state<FriendGroup[]>([]),
		selected = $state<Record<string, string[]>>({}),
		loading = $state(true),
		acting = $state<string | null>(null),
		error = $state('');
	let paymentPending = $state<string | null>(null);
	let paymentRequestId = $state<string | null>(null);
	let paymentPlan = $state<PaidPlan>('join');
	let canManageGroups = $derived(
		isUserPlan($session.data?.user.plan) &&
			getPlanCapabilities($session.data.user.plan).canManageGroups
	);
	onMount(() => {
		void load();
	});
	async function load() {
		loading = true;
		try {
			const [pending, groupList] = await Promise.all([
				todoInvitesApi.pending(),
				canManageGroups ? friendsApi.listGroups() : Promise.resolve({ groups: [] })
			]);
			requests = pending.requests;
			groups = groupList.groups;
		} catch {
			error = m.access_requests_load_failed();
		} finally {
			loading = false;
		}
	}
	async function act(request: TodoAccessRequest, action: 'grant' | 'contact' | 'reject') {
		acting = request.id;
		error = '';
		try {
			if (action === 'reject') await todoInvitesApi.reject(request.id);
			else
				await todoInvitesApi.accept(
					request.id,
					action === 'contact',
					action === 'contact' ? (selected[request.id] ?? []) : []
				);
			requests = requests.filter((item) => item.id !== request.id);
			onchange?.();
		} catch {
			error = m.access_request_failed();
		} finally {
			acting = null;
		}
	}
	async function upgradeRequester(request: TodoAccessRequest) {
		paymentPending = request.id;
		error = '';
		try {
			const response = await fetch('/api/billing/sponsored-payment', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					beneficiaryId: request.requester.userId,
					plan: paymentPlan,
					autoRenew: false
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
				paymentRequestId = null;
				window.setTimeout(() => void load(), 1500);
			});
			paddle.Checkout.open({
				transactionId: result.transactionId,
				customer: $session.data?.user.email ? { email: $session.data.user.email } : undefined,
				settings: { displayMode: 'overlay', theme: 'light', successUrl: `${location.origin}/app` }
			});
		} catch (cause) {
			error =
				cause instanceof Error && cause.message ? cause.message : m.user_plan_upgrade_failed();
		} finally {
			paymentPending = null;
		}
	}
</script>

<Modal title={m.access_requests()} {onclose} width="36rem">
	{#if loading}<p>{m.loading()}</p>{:else if requests.length === 0}<p class="muted">
			{m.no_new_requests()}
		</p>{:else}<ul>
			{#each requests as request (request.id)}<li>
					<div>
						<strong>{request.requester.name || request.requester.email}</strong><small
							>{request.requester.email} · {m.todo_short_id({
								id: request.todoId.slice(0, 8)
							})}</small
						>
						<small>{m.plan_named({ plan: PLAN_DEFINITIONS[request.requester.plan].label })}</small>
					</div>
					{#if !request.requesterIsFriend}<FriendGroupPicker
							{groups}
							selected={selected[request.id] ?? []}
							onchange={(ids) => (selected = { ...selected, [request.id]: ids })}
							legend={m.contact_groups_legend()}
						/>{/if}
					<div class="actions">
						{#if !getPlanCapabilities(request.requester.plan).canJoinSharedTodo}<IconButton
								icon={IconCreditCardPay}
								label={m.pay_plan_for({ name: request.requester.name || request.requester.email })}
								disabled={acting !== null || paymentPending !== null}
								onclick={() =>
									(paymentRequestId = paymentRequestId === request.id ? null : request.id)}
							/>{/if}
						<IconButton
							icon={IconUserCheck}
							label={m.grant_access()}
							disabled={acting !== null ||
								!getPlanCapabilities(request.requester.plan).canJoinSharedTodo}
							onclick={() => void act(request, 'grant')}
						/>
						{#if !request.requesterIsFriend}<IconButton
								icon={IconAddressBook}
								label={m.grant_access_and_contact()}
								disabled={acting !== null ||
									!getPlanCapabilities(request.requester.plan).canJoinSharedTodo}
								onclick={() => void act(request, 'contact')}
							/>{/if}
						<IconButton
							icon={IconX}
							label={m.reject_request()}
							disabled={acting !== null}
							onclick={() => void act(request, 'reject')}
						/>
					</div>
					{#if paymentRequestId === request.id}<div class="payment">
							<Select
								ariaLabel={m.plan()}
								bind:value={paymentPlan}
								options={PAID_PLANS.filter(
									(plan) => getPlanCapabilities(plan).canJoinSharedTodo
								).map((plan) => ({
									value: plan,
									label: `${PLAN_DEFINITIONS[plan].label} — ${formatUsd(PLAN_PRICES_USD_CENTS[plan].month)}`
								}))}
							/>
							<IconButton
								icon={paymentPending === request.id ? IconCheck : IconCreditCardPay}
								label={paymentPending === request.id
									? m.payment_in_progress()
									: m.pay_for_plan({ plan: PLAN_DEFINITIONS[paymentPlan].label })}
								disabled={paymentPending !== null}
								onclick={() => void upgradeRequester(request)}
							/>
						</div>{/if}
				</li>{/each}
		</ul>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
	:global(.modal-body) {
		padding: 1.5rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: grid;
		gap: 0.65rem;
		border-top: 1px solid #e0e4e0;
		padding: 1rem 0;
	}
	li > div:first-child {
		display: grid;
	}
	small,
	.muted {
		color: #69746c;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	.payment {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.payment :global(.select) {
		min-width: 0;
		flex: 1;
	}
	.error {
		color: #922b2b;
	}
</style>
