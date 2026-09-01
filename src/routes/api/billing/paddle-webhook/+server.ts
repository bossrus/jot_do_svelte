import { json } from '@sveltejs/kit';
import { processPaddleWebhook, verifyPaddleSignature } from '$lib/server/billing/paddle-webhook';

export async function POST({ request }) {
	const rawBody = await request.text();
	if (!verifyPaddleSignature(rawBody, request.headers.get('Paddle-Signature')))
		return json({ code: 'INVALID_SIGNATURE' }, { status: 401 });
	let payload: unknown;
	try {
		payload = JSON.parse(rawBody) as unknown;
	} catch {
		return json({ code: 'INVALID_BODY' }, { status: 400 });
	}
	const result = await processPaddleWebhook(payload);
	return json({ result });
}
