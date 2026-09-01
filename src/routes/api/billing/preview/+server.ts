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
		return json({ code: 'INVALID_BODY', message: 'Некорректные параметры тарифа' }, { status: 400 });

	const { plan, period } = parsed.data;
	const [user] = await db
		.select({ plan: users.plan, billingPeriod: users.billingPeriod })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);
	if (!user) return json({ code: 'USER_NOT_FOUND' }, { status: 404 });
	if (
		!isPaidPlan(plan) ||
		!isBillingPeriod(period) ||
		!isUserPlan(user.plan) ||
		getPlanRank(plan) <= getPlanRank(user.plan)
	)
		return json({ code: 'NOT_AN_UPGRADE' }, { status: 409 });
	if (
		isBillingPeriod(user.billingPeriod) &&
		getBillingPeriodRank(period) < getBillingPeriodRank(user.billingPeriod)
	)
		return json({ code: 'BILLING_PERIOD_REDUCTION_NOT_ALLOWED' }, { status: 409 });

	const [activeSubscription] = await db
		.select({ providerSubscriptionId: subscriptions.providerSubscriptionId })
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
	if (!activeSubscription) return json({ code: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 409 });

	const preview = await getPaddleClient().subscriptions.previewUpdate(
		activeSubscription.providerSubscriptionId,
		{
			items: [{ priceId: getPaddlePriceId(plan, period), quantity: 1 }],
			prorationBillingMode: 'prorated_immediately',
			onPaymentFailure: 'prevent_change',
			customData: { user_id: locals.user.id, plan, period }
		}
	);
	const totals = preview.immediateTransaction?.details.totals;
	return json({
		amount: Number(totals?.grandTotal ?? '0'),
		currency: totals?.currencyCode ?? preview.currencyCode,
		credit: Number(totals?.credit ?? '0')
	});
}
