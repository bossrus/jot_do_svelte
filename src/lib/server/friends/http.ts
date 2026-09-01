import { error, type RequestEvent } from '@sveltejs/kit';

export function requireAuthenticatedUser(event: Pick<RequestEvent, 'locals'>) {
	if (!event.locals.user) error(401, { message: 'Unauthenticated' });
	return event.locals.user;
}
