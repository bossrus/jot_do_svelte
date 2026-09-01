import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recurringService } from '$lib/server/recurring/service';
export const POST: RequestHandler = async ({ request }) => {
	const token = request.headers.get('authorization');
	if (!env.RECURRING_SCHEDULER_SECRET || token !== `Bearer ${env.RECURRING_SCHEDULER_SECRET}`)
		error(401);
	return json(await recurringService.runDue());
};
