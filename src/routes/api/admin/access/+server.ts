import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin/auth';

export function GET(event) {
	requireAdmin(event);
	return json({ allowed: true });
}
