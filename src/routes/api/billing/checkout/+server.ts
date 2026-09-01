import { and, desc, eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getBillingPeriodRank, isBillingPeriod } from '$lib/billing/pricing';
import { getPlanRank, isPaidPlan, isUserPlan } from '$lib/billing/plans';
import { db } from '$lib/server/db';
import { subscriptions, users } from '$lib/server/db/schema';
import { getPaddleClient, getPaddlePriceId } from '$lib/server/billing/paddle';

const inputSchema = z.strictObject({
	plan: z.enum(['cloud', 'join', 'share', 'group']),
	period: z.enum(['month', 'year', 'five-years'])
});

export async function POST({ locals, request }) {
	if (!locals.user) return json({ code: 'UNAUTHENTICATED' }, { status: 401 });
	const parsed = inputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success)
		return json(
			{ code: 'INVALID_BODY', message: 'Некорректные параметры тарифа' },
			{ status: 400 }
		);

	const { plan, period } = parsed.data;
	if (!isPaidPlan(plan) || !isBillingPeriod(period))
		return json({ code: 'INVALID_PLAN', message: 'Неизвестный тариф' }, { status: 400 });

	const [user] = await db
		.select({ id: users.id, plan: users.plan, billingPeriod: users.billingPeriod })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);
	if (!user) return json({ code: 'USER_NOT_FOUND' }, { status: 404 });
	if (isUserPlan(user.plan) && getPlanRank(plan) < getPlanRank(user.plan))
		return json(
			{
				code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
				message: 'Можно выбрать только после окончания текущего оплаченного периода'
			},
			{ status: 409 }
		);
	if (
		isBillingPeriod(user.billingPeriod) &&
		getBillingPeriodRank(period) < getBillingPeriodRank(user.billingPeriod)
	)
		return json(
			{
				code: 'BILLING_PERIOD_REDUCTION_NOT_ALLOWED',
				message: 'Будет доступна по окончании текущего оплаченного периода'
			},
			{ status: 409 }
		);

	const [activeSubscription] = await db
		.select({
			providerSubscriptionId: subscriptions.providerSubscriptionId
		})
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.userId, locals.user.id),
				eq(subscriptions.provider, 'paddle'),
				eq(subscriptions.status, 'active')
			)
		)
		.orderBy(desc(subscriptions.updatedAt))
		.limit(1);

	const priceId = getPaddlePriceId(plan, period);
	if (activeSubscription) {
		await getPaddleClient().subscriptions.update(activeSubscription.providerSubscriptionId, {
			items: [{ priceId, quantity: 1 }],
			prorationBillingMode: 'prorated_immediately',
			onPaymentFailure: 'prevent_change',
			customData: { user_id: locals.user.id, plan, period }
		});
		return json({ change: 'updating' });
	}

	const transaction = await getPaddleClient().transactions.create({
		items: [{ priceId, quantity: 1 }],
		collectionMode: 'automatic',
		customData: { user_id: locals.user.id, plan, period }
	});
	return json({ change: 'checkout', transactionId: transaction.id });
}
