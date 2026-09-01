import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';

export function getAdminEmails() {
	return (env.ADMIN_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
	return Boolean(email && new Set(getAdminEmails()).has(email.trim().toLowerCase()));
}

export function requireAdmin(event: Pick<RequestEvent, 'locals'>) {
	const user = event.locals.user;
	if (!user) error(401, { message: 'UNAUTHENTICATED' });
	if (!isAdminEmail(user.email)) error(403, { message: 'ADMIN_ACCESS_DENIED' });
	return user;
}
