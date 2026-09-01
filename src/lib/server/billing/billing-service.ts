import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sponsoredSubscriptions, subscriptions, users } from '$lib/server/db/schema';
import { getPlanRank, isPaidPlan, isUserPlan, type UserPlan } from '$lib/billing/plans';
import { getBillingPeriodRank, getPeriodEnd, isBillingPeriod } from '$lib/billing/pricing';

export class BillingError extends Error {
	constructor(
		readonly code:
			| 'INVALID_PLAN'
			| 'INVALID_PERIOD'
			| 'USER_NOT_FOUND'
			| 'DOWNGRADE_NOT_ALLOWED'
			| 'BILLING_PERIOD_REDUCTION_NOT_ALLOWED',
		message: string
	) {
		super(message);
	}
}

export async function handleSuccessfulPayment(
	userId: string,
	requestedPlan: unknown,
	requestedPeriod: unknown
) {
	if (!isPaidPlan(requestedPlan))
		throw new BillingError('INVALID_PLAN', 'Only paid plans can be purchased');
	if (!isBillingPeriod(requestedPeriod))
		throw new BillingError('INVALID_PERIOD', 'Unknown billing period');

	const now = new Date();
	return db.transaction(async (tx) => {
		const [user] = await tx
			.select({ plan: users.plan, billingPeriod: users.billingPeriod })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user) throw new BillingError('USER_NOT_FOUND', 'User not found');
		if (isPaidPlan(user.plan) && getPlanRank(requestedPlan) < getPlanRank(user.plan)) {
			throw new BillingError(
				'DOWNGRADE_NOT_ALLOWED',
				'Можно будет выбрать по окончании текущего тарифа'
			);
		}
		if (
			isBillingPeriod(user.billingPeriod) &&
			getBillingPeriodRank(requestedPeriod) < getBillingPeriodRank(user.billingPeriod)
		) {
			throw new BillingError(
				'BILLING_PERIOD_REDUCTION_NOT_ALLOWED',
				'Будет доступна по окончании текущего оплаченного периода'
			);
		}

		const periodEnd = getPeriodEnd(now, requestedPeriod);
		await tx
			.update(subscriptions)
			.set({ status: 'expired', updatedAt: now })
			.where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));
		await tx.insert(subscriptions).values({
			userId,
			plan: requestedPlan,
			status: 'active',
			currentPeriodStart: now,
			currentPeriodEnd: periodEnd,
			provider: 'fake',
			providerSubscriptionId: crypto.randomUUID()
		});
		await tx
			.update(users)
			.set({
				plan: requestedPlan,
				planExpiresAt: periodEnd,
				billingPeriod: requestedPeriod,
				updatedAt: now
			})
			.where(eq(users.id, userId));

		return {
			id: userId,
			plan: requestedPlan,
			billingPeriod: requestedPeriod,
			currentPeriodEnd: periodEnd,
			change: isPaidPlan(user.plan) ? ('upgrade' as const) : ('new' as const)
		};
	});
}

// Subscription expiry/cancellation can call this with `free`. It deliberately freezes cloud
// data by changing only the plan; todos and R2 objects are never touched.
export async function setUserPlan(userId: string, requestedPlan: unknown) {
	if (!isUserPlan(requestedPlan)) throw new BillingError('INVALID_PLAN', 'Unknown plan');
	const [updated] = await db
		.update(users)
		.set({
			plan: requestedPlan,
			planExpiresAt: null,
			billingPeriod: null,
			updatedAt: new Date()
		})
		.where(eq(users.id, userId))
		.returning({ id: users.id, plan: users.plan });

	if (!updated) throw new BillingError('USER_NOT_FOUND', 'User not found');
	return updated as { id: string; plan: UserPlan };
}

export async function handleSuccessfulSponsoredPayment(
	payerId: string,
	beneficiaryId: string,
	requestedPlan: unknown,
	autoRenew: boolean
) {
	if (!isPaidPlan(requestedPlan))
		throw new BillingError('INVALID_PLAN', 'Only paid plans can be purchased');
	const [beneficiary] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, beneficiaryId))
		.limit(1);
	if (!beneficiary) throw new BillingError('USER_NOT_FOUND', 'User not found');

	const periodStart = new Date();
	const periodEnd = new Date(periodStart);
	periodEnd.setMonth(periodEnd.getMonth() + 1);
	return db.transaction(async (tx) => {
		const [subscription] = await tx
			.insert(subscriptions)
			.values({
				userId: beneficiaryId,
				plan: requestedPlan,
				status: 'active',
				currentPeriodStart: periodStart,
				currentPeriodEnd: periodEnd,
				provider: 'fake-sponsored',
				providerSubscriptionId: crypto.randomUUID()
			})
			.returning({ id: subscriptions.id });
		await tx.insert(sponsoredSubscriptions).values({
			payerId,
			beneficiaryId,
			subscriptionId: subscription.id,
			autoRenew
		});
		await tx
			.update(users)
			.set({ plan: requestedPlan, planExpiresAt: periodEnd, updatedAt: new Date() })
			.where(eq(users.id, beneficiaryId));
		return { beneficiaryId, plan: requestedPlan, autoRenew, currentPeriodEnd: periodEnd };
	});
}
