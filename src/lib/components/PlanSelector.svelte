<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { authService, session } from '$lib/client/auth';
	import { loadPaddle } from '$lib/billing/paddle-client';
	import {
		PLAN_DEFINITIONS,
		PAID_PLANS,
		getPlanRank,
		isPaidPlan,
		isUserPlan,
		type PaidPlan,
		type UserPlan
	} from '$lib/billing/plans';
	import {
		BILLING_PERIODS,
		formatUsd,
		getBillingPeriodRank,
		getMonthlyEquivalentCents,
		getPeriodPriceCents,
		isBillingPeriod,
		type BillingPeriod
	} from '$lib/billing/pricing';
	import Modal from '$lib/components/Modal.svelte';
	import {
		IconCheck,
		IconCloud,
		IconCrown,
		IconShare,
		IconUsers
	} from '@tabler/icons-svelte-runes';
	import { m } from '$lib/paraglide/messages';
	import { currentLocale, localeVersion } from '$lib/client/locale';
	$localeVersion;
	let { onclose }: { onclose: () => void } = $props();
	let period = $state<BillingPeriod>('year');
	let processingPlan = $state<PaidPlan | null>(null);
	let message = $state('');
	let previewVersion = 0;
	let upgradePreviews = $state<Partial<Record<PaidPlan, { amount: number; currency: string }>>>({});
	let emailVerified = $derived(Boolean($session.data?.user.emailVerified));
	let emailVerificationTitle = $derived(m.verification_required_payment());
	let currentPlan = $derived<UserPlan>(
		isUserPlan($session.data?.user.plan) ? $session.data.user.plan : 'free'
	);
	let currentBillingPeriod = $derived<BillingPeriod | null>(
		isBillingPeriod($session.data?.user.billingPeriod) ? $session.data.user.billingPeriod : null
	);
	let periods = $derived([
		{ id: 'month' as const, months: BILLING_PERIODS.month.months, label: m.billing_month() },
		{
			id: 'year' as const,
			months: BILLING_PERIODS.year.months,
			label: m.billing_year(),
			badge: m.better_value()
		},
		{
			id: 'five-years' as const,
			months: BILLING_PERIODS['five-years'].months,
			label: m.billing_five_years(),
			badge: m.maximum()
		}
	]);
	let features = $derived<Record<PaidPlan, string[]>>({
		cloud: [m.feature_sync(), m.feature_recurring()],
		join: [m.feature_cloud_all(), m.feature_join_shared()],
		share: [m.feature_join_all(), m.feature_share_collaboration()],
		group: [m.feature_share_all(), m.feature_group_management()]
	});
	const icons = { cloud: IconCloud, join: IconUsers, share: IconShare, group: IconCrown };
	function selectedPeriod() {
		return periods.find((item) => item.id === period) ?? periods[0];
	}
	function monthlyPrice(plan: PaidPlan) {
		return getMonthlyEquivalentCents(plan, period);
	}
	function totalPrice(plan: PaidPlan) {
		return getPeriodPriceCents(plan, period);
	}
	function formatMoney(amount: number, currency: string) {
		return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency }).format(
			amount / 100
		);
	}
	function isDowngrade(plan: PaidPlan) {
		return isPaidPlan(currentPlan) && getPlanRank(plan) < getPlanRank(currentPlan);
	}
	function isShorterPeriod(candidate: BillingPeriod) {
		return (
			currentBillingPeriod !== null &&
			getBillingPeriodRank(candidate) < getBillingPeriodRank(currentBillingPeriod)
		);
	}
	$effect(() => {
		if (currentBillingPeriod && isShorterPeriod(period)) period = currentBillingPeriod;
	});
	$effect(() => {
		period;
		currentPlan;
		if (!isPaidPlan(currentPlan)) {
			upgradePreviews = {};
			return;
		}
		void loadUpgradePreviews();
	});
	async function loadUpgradePreviews() {
		const version = ++previewVersion;
		const candidates = PAID_PLANS.filter((plan) => getPlanRank(plan) > getPlanRank(currentPlan));
		const entries = await Promise.all(
			candidates.map(async (plan) => {
				const response = await fetch('/api/billing/preview', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ plan, period })
				});
				if (!response.ok) return null;
				const data = (await response.json()) as { amount: number; currency: string };
				return [plan, data] as const;
			})
		);
		if (version !== previewVersion) return;
		upgradePreviews = Object.fromEntries(entries.filter((entry) => entry !== null));
	}
	function asDate(value: Date | string | null | undefined) {
		return value ? new Date(value) : null;
	}
	function formatDate(value: Date | string | null | undefined) {
		const date = asDate(value);
		return date
			? new Intl.DateTimeFormat(currentLocale(), {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				}).format(date)
			: '';
	}
	async function purchase(plan: PaidPlan) {
		if (processingPlan || !emailVerified || isDowngrade(plan) || isShorterPeriod(period)) return;
		processingPlan = plan;
		message = '';
		try {
			const response = await fetch('/api/billing/checkout', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ plan, period })
			});
			const result = (await response.json().catch(() => ({}))) as {
				change?: 'checkout' | 'updating';
				transactionId?: string;
				message?: string;
			};
			if (!response.ok) throw new Error(result.message || m.payment_failed());
			if (result.change === 'checkout' && result.transactionId) {
				const token = env.PUBLIC_PADDLE_CLIENT_TOKEN;
				if (!token) throw new Error(m.payment_failed());
				const paddle = await loadPaddle(token, (event) => {
					if (event.name === 'checkout.completed') {
						message = m.payment_processing_webhook();
						void authService.refreshSession();
					}
				});
				paddle.Checkout.open({
					transactionId: result.transactionId,
					customer: $session.data?.user.email ? { email: $session.data.user.email } : undefined,
					settings: {
						displayMode: 'overlay',
						theme: 'light',
						successUrl: `${location.origin}/app`
					}
				});
				return;
			}
			message = m.payment_processing_webhook();
			await authService.refreshSession();
		} catch (error) {
			message = error instanceof Error ? error.message : m.payment_failed();
		} finally {
			processingPlan = null;
		}
	}
</script>

<Modal title={m.choose_plan()} {onclose} width="72rem" maxHeight="calc(100dvh - 2rem)">
	<section class="plans" aria-label={m.plan_choice()}>
		<div class="intro">
			<p>{m.plan_more_features()}</p>
			<span>{m.plan_upgrade_hint()}</span>
		</div>
		{#if isPaidPlan(currentPlan) && $session.data?.user.planExpiresAt}
			<div class="current-summary">
				<strong>{m.current_plan({ plan: PLAN_DEFINITIONS[currentPlan].label })}</strong>
				<span>{m.valid_until({ date: formatDate($session.data.user.planExpiresAt) })}</span>
			</div>
		{/if}
		<div class="period-tabs" role="tablist" aria-label={m.billing_period()}>
			{#each periods as item (item.id)}
				<span
					class="period-tab-wrapper"
					title={!emailVerified
						? emailVerificationTitle
						: isShorterPeriod(item.id)
							? m.available_after_paid_period()
							: undefined}
				>
					<button
						type="button"
						role="tab"
						aria-selected={period === item.id}
						class:active={period === item.id}
						disabled={!emailVerified || isShorterPeriod(item.id)}
						onclick={() => (period = item.id)}
						>{item.label}{#if item.badge}<small>{item.badge}</small>{/if}</button
					>
				</span>
			{/each}
		</div>
		<div class="cards">
			{#each PAID_PLANS as plan (plan)}
				{@const definition = PLAN_DEFINITIONS[plan]}
				{@const PlanIcon = icons[plan]}
				<article class:active={plan === currentPlan} class:featured={plan === 'share'}>
					{#if plan === 'share'}<div class="popular">{m.popular()}</div>{/if}
					<div class="plan-title">
						<span><PlanIcon size={23} /></span>
						<h3>{definition.label}</h3>
					</div>
					<p class="description">
						{plan === 'cloud'
							? m.plan_cloud_description()
							: plan === 'join'
								? m.plan_join_description()
								: plan === 'share'
									? m.plan_share_description()
									: m.plan_group_description()}
					</p>
					{#if upgradePreviews[plan]}<p class="proration">
							{m.upgrade_charge_now({
								amount: formatMoney(upgradePreviews[plan]!.amount, upgradePreviews[plan]!.currency)
							})}
						</p>{/if}
					<div class="price">
						<strong>{formatUsd(monthlyPrice(plan))}</strong><span>{m.per_month()}</span>
					</div>
					{#if selectedPeriod().months > 1}<p class="total">
							{m.total_for_period({ price: formatUsd(totalPrice(plan)) })}
						</p>{:else}<p class="total">{m.billed_monthly()}</p>{/if}
					<ul>
						{#each features[plan] as feature (feature)}<li>
								<IconCheck size={18} />{feature}
							</li>{/each}
					</ul>
					{#if plan === currentPlan}<span
							class="select-wrapper"
							title={!emailVerified ? emailVerificationTitle : undefined}
							><button class="select" type="button" disabled>{m.current_plan_button()}</button
							></span
						>{:else}
						<span
							class="select-wrapper"
							title={!emailVerified
								? emailVerificationTitle
								: isDowngrade(plan)
									? m.downgrade_after_period()
									: undefined}
						>
							<button
								class="select"
								type="button"
								disabled={!emailVerified || processingPlan !== null || isDowngrade(plan)}
								onclick={() => void purchase(plan)}
								>{processingPlan === plan ? m.processing() : m.select_plan()}</button
							>
						</span>
					{/if}
				</article>
			{/each}
		</div>
		{#if message}<p class="message" role="status">{message}</p>{/if}
		<p class="note">{m.secure_payment_note()}</p>
	</section>
</Modal>

<style>
	.plans {
		padding: 1.5rem 1.65rem 1.25rem;
		background: #fff;
	}
	.intro {
		text-align: center;
	}
	.intro p {
		margin: 0;
		color: #111827;
		font-size: 1.3rem;
		font-weight: 750;
	}
	.intro span {
		display: block;
		margin-top: 0.35rem;
		color: #6b7280;
		font-size: 0.88rem;
	}
	.current-summary {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem 1rem;
		margin: 1rem auto 0;
		border-radius: 0.65rem;
		background: #edf5ff;
		padding: 0.7rem 1rem;
		color: #526071;
		font-size: 0.8rem;
	}
	.current-summary strong {
		color: var(--color-accent);
	}
	.period-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		width: min(100%, 31rem);
		margin: 1.35rem auto 1.6rem;
		border-radius: 0.7rem;
		background: #f1f4f8;
		padding: 0.3rem;
	}
	.period-tabs button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 2.65rem;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: #586173;
		font-weight: 700;
		cursor: pointer;
	}
	.period-tab-wrapper {
		display: block;
	}
	.period-tab-wrapper button {
		width: 100%;
	}
	.period-tabs button:disabled {
		color: #9aa2af;
		cursor: default;
		opacity: 0.65;
	}
	.period-tabs button.active {
		background: #fff;
		color: var(--color-accent);
		box-shadow: 0 2px 8px rgb(15 23 42 / 10%);
	}
	.period-tabs small {
		border-radius: 1rem;
		background: #def7e7;
		padding: 0.15rem 0.38rem;
		color: #15803d;
		font-size: 0.67rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.8rem;
	}
	article {
		position: relative;
		display: flex;
		min-width: 0;
		flex-direction: column;
		border: 1px solid #dce3ec;
		border-radius: 0.85rem;
		padding: 1.15rem;
		background: #fff;
	}
	article.featured {
		border: 2px solid var(--color-accent);
		padding: calc(1.15rem - 1px);
	}
	article.active {
		background: #f7faff;
	}
	.popular {
		position: absolute;
		top: -13px;
		left: 50%;
		transform: translateX(-50%);
		border-radius: 1rem;
		background: var(--color-accent);
		padding: 0.28rem 0.7rem;
		color: #fff;
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.plan-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.plan-title > span {
		display: grid;
		width: 2.35rem;
		height: 2.35rem;
		place-items: center;
		border-radius: 0.65rem;
		background: #edf5ff;
		color: var(--color-accent);
	}
	h3 {
		margin: 0;
		font-size: 1.08rem;
	}
	.description {
		min-height: 2.4rem;
		margin: 0.75rem 0;
		color: #6b7280;
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.proration {
		margin: -0.45rem 0 0.7rem;
		color: #15803d;
		font-size: 0.74rem;
		font-weight: 750;
	}
	.price {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		color: #111827;
	}
	.price strong {
		font-size: 1.35rem;
	}
	.price span,
	.total {
		color: #7b8492;
		font-size: 0.72rem;
	}
	.total {
		min-height: 1.1rem;
		margin: 0.25rem 0 1rem;
	}
	ul {
		display: grid;
		gap: 0.58rem;
		min-height: 4rem;
		margin: 0 0 1.15rem;
		padding: 0;
		list-style: none;
		color: #424b59;
		font-size: 0.78rem;
	}
	li {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
	}
	li :global(svg) {
		flex: none;
		color: #16a34a;
	}
	.select {
		width: 100%;
		min-height: 2.65rem;
		margin-top: auto;
		border: 1px solid var(--color-accent);
		border-radius: 0.6rem;
		background: var(--color-accent);
		color: #fff;
		font-weight: 750;
		cursor: pointer;
	}
	.select-wrapper {
		display: block;
		margin-top: auto;
	}
	.select-wrapper .select {
		margin-top: 0;
	}
	.select:disabled {
		border-color: #d8dee7;
		background: #eef1f5;
		color: #7c8491;
		cursor: default;
	}
	.message {
		margin: 1rem 0 0;
		color: var(--color-accent);
		text-align: center;
		font-size: 0.85rem;
	}
	.note {
		margin: 1.15rem 0 0;
		color: #8a93a1;
		text-align: center;
		font-size: 0.72rem;
	}
	@media (max-width: 900px) {
		.cards {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}
	}
	@media (max-width: 560px) {
		.plans {
			padding: 1.1rem 0.85rem;
		}
		.period-tabs {
			font-size: 0.78rem;
		}
		.period-tabs small {
			display: none;
		}
		.cards {
			grid-template-columns: 1fr;
		}
		.description,
		ul {
			min-height: 0;
		}
	}
</style>
