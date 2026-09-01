import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { and, eq } from 'drizzle-orm';
import type { PaidPlan } from '$lib/billing/plans';
import type { BillingPeriod } from '$lib/billing/pricing';
import { db } from '$lib/server/db';
import {
	billingWebhookEvents,
	sponsoredSubscriptions,
	subscriptions,
	users
} from '$lib/server/db/schema';
import { getPaddleClient, getPlanForPaddlePrice } from './paddle';

const SIGNATURE_TOLERANCE_SECONDS = 5;

export function verifyPaddleSignature(
	rawBody: string,
	header: string | null,
	now = Date.now(),
	secret = env.PADDLE_WEBHOOK_SECRET
): boolean {
	if (!secret || !header) return false;
	const parts = header.split(';').map((part) => part.split('='));
	const timestamp = parts.find(([key]) => key === 'ts')?.[1];
	const signatures = parts.filter(([key]) => key === 'h1').map(([, value]) => value);
	if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
	if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
	const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest();
	return signatures.some((signature) => {
		if (!/^[a-f\d]{64}$/i.test(signature)) return false;
		const actual = Buffer.from(signature, 'hex');
		return actual.length === expected.length && timingSafeEqual(actual, expected);
	});
}

type PaddleSubscriptionEvent = {
	event_id: string;
	event_type: string;
	occurred_at: string;
	data: {
		id: string;
		status: 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';
		custom_data?: {
			user_id?: string;
			payer_id?: string;
			plan?: PaidPlan;
			period?: BillingPeriod;
			sponsored?: boolean;
			auto_renew?: boolean;
		} | null;
		items?: Array<{ price?: { id?: string } }>;
		current_billing_period?: { starts_at: string; ends_at: string } | null;
	};
};

function isSubscriptionEvent(value: unknown): value is PaddleSubscriptionEvent {
	if (!value || typeof value !== 'object') return false;
	const event = value as Partial<PaddleSubscriptionEvent>;
	return (
		typeof event.event_id === 'string' &&
		typeof event.event_type === 'string' &&
		event.event_type.startsWith('subscription.') &&
		!!event.data &&
		typeof event.data.id === 'string'
	);
}

export async function processPaddleWebhook(
	payload: unknown
): Promise<'processed' | 'ignored' | 'duplicate'> {
	if (!isSubscriptionEvent(payload)) return 'ignored';
	const event = payload;
	const result = await db.transaction(async (tx) => {
		const [claimed] = await tx
			.insert(billingWebhookEvents)
			.values({
				eventId: event.event_id,
				eventType: event.event_type,
				occurredAt: new Date(event.occurred_at)
			})
			.onConflictDoNothing()
			.returning({ eventId: billingWebhookEvents.eventId });
		if (!claimed) return 'duplicate';

		const providerSubscriptionId = event.data.id;
		let userId = event.data.custom_data?.user_id;
		if (!userId) {
			const [known] = await tx
				.select({ userId: subscriptions.userId })
				.from(subscriptions)
				.where(
					and(
						eq(subscriptions.provider, 'paddle'),
						eq(subscriptions.providerSubscriptionId, providerSubscriptionId)
					)
				)
				.limit(1);
			userId = known?.userId;
		}
		if (!userId) return 'ignored';

		const priceId = event.data.items?.[0]?.price?.id;
		const mapped = priceId ? getPlanForPaddlePrice(priceId) : null;
		const period = event.data.current_billing_period;
		if (!mapped || !period) return 'ignored';

		const periodStart = new Date(period.starts_at);
		const periodEnd = new Date(period.ends_at);
		const [user] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!user) return 'ignored';

		const status =
			event.data.status === 'active' || event.data.status === 'trialing'
				? 'active'
				: event.data.status === 'past_due'
					? 'past_due'
					: 'canceled';
		await tx
			.update(subscriptions)
			.set({ status: 'expired', updatedAt: new Date() })
			.where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));
		const [storedSubscription] = await tx
			.insert(subscriptions)
			.values({
				userId,
				plan: mapped.plan,
				status,
				currentPeriodStart: periodStart,
				currentPeriodEnd: periodEnd,
				provider: 'paddle',
				providerSubscriptionId
			})
			.onConflictDoUpdate({
				target: [subscriptions.provider, subscriptions.providerSubscriptionId],
				set: {
					plan: mapped.plan,
					status,
					currentPeriodStart: periodStart,
					currentPeriodEnd: periodEnd,
					updatedAt: new Date()
				}
			})
			.returning({ id: subscriptions.id });

		const payerId = event.data.custom_data?.payer_id;
		if (event.data.custom_data?.sponsored && payerId && storedSubscription) {
			const [payer] = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.id, payerId))
				.limit(1);
			if (payer && payer.id !== userId) {
				await tx
					.insert(sponsoredSubscriptions)
					.values({
						payerId: payer.id,
						beneficiaryId: userId,
						subscriptionId: storedSubscription.id,
						autoRenew: event.data.custom_data?.auto_renew === true
					})
					.onConflictDoUpdate({
						target: sponsoredSubscriptions.subscriptionId,
						set: {
							payerId: payer.id,
							beneficiaryId: userId,
							autoRenew: event.data.custom_data?.auto_renew === true,
							active: true,
							stoppedAt: null
						}
					});
			}
		}

		if (status === 'past_due') return 'processed';
		if (status === 'canceled') {
			await tx
				.update(users)
				.set({
					plan: 'free',
					planExpiresAt: null,
					billingPeriod: null,
					updatedAt: new Date()
				})
				.where(eq(users.id, userId));
			return 'processed';
		}

		await tx
			.update(users)
			.set({
				plan: mapped.plan,
				planExpiresAt: periodEnd,
				billingPeriod: mapped.period,
				updatedAt: new Date()
			})
			.where(eq(users.id, userId));
		return 'processed';
	});
	if (
		result === 'processed' &&
		event.event_type === 'subscription.created' &&
		event.data.custom_data?.sponsored === true &&
		event.data.custom_data?.auto_renew !== true
	) {
		await getPaddleClient().subscriptions.cancel(event.data.id, {
			effectiveFrom: 'next_billing_period'
		});
	}
	return result;
}
