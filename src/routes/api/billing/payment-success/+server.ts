import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { BillingError, handleSuccessfulPayment } from '$lib/server/billing/billing-service';

export async function POST({ locals, request }) {
	if (env.ENABLE_FAKE_PAYMENTS !== 'true') {
		return json(
			{ code: 'FAKE_PAYMENTS_DISABLED', message: 'Тестовые платежи отключены' },
			{ status: 503 }
		);
	}
	if (!locals.user) return json({ code: 'UNAUTHENTICATED' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ code: 'INVALID_BODY', message: 'Некорректные параметры тарифа' },
			{ status: 400 }
		);
	}

	try {
		const result = await handleSuccessfulPayment(
			locals.user.id,
			typeof body === 'object' && body !== null && 'plan' in body ? body.plan : undefined,
			typeof body === 'object' && body !== null && 'period' in body ? body.period : undefined
		);
		return json(result);
	} catch (cause) {
		if (cause instanceof BillingError) {
			return json(
				{ code: cause.code, message: cause.message },
				{
					status:
						cause.code === 'USER_NOT_FOUND' ? 404 : cause.code.includes('NOT_ALLOWED') ? 409 : 400
				}
			);
		}
		throw cause;
	}
}
