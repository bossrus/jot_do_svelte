import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getPaddleClient, getPaddlePriceId } from '$lib/server/billing/paddle';

const inputSchema = z.strictObject({
	beneficiaryId: z.uuid(),
	plan: z.enum(['cloud', 'join', 'share', 'group']),
	autoRenew: z.boolean()
});

export async function POST({ locals, request }) {
	if (!locals.user) return json({ code: 'UNAUTHENTICATED' }, { status: 401 });
	const parsed = inputSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success)
		return json(
			{ code: 'INVALID_BODY', message: 'Некорректные параметры оплаты' },
			{ status: 400 }
		);
	if (parsed.data.beneficiaryId === locals.user.id)
		return json({ code: 'INVALID_BENEFICIARY' }, { status: 400 });
	const [beneficiary] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, parsed.data.beneficiaryId))
		.limit(1);
	if (!beneficiary) return json({ code: 'USER_NOT_FOUND' }, { status: 404 });

	const transaction = await getPaddleClient().transactions.create({
		items: [{ priceId: getPaddlePriceId(parsed.data.plan, 'month'), quantity: 1 }],
		collectionMode: 'automatic',
		customData: {
			user_id: beneficiary.id,
			payer_id: locals.user.id,
			plan: parsed.data.plan,
			period: 'month',
			sponsored: true,
			auto_renew: parsed.data.autoRenew
		}
	});
	return json({ change: 'checkout', transactionId: transaction.id });
}
