import type { RequestEvent } from '@sveltejs/kit';
import { auth } from './index';

export function getCurrentSession(event: Pick<RequestEvent, 'request'>) {
	return auth.api.getSession({ headers: event.request.headers });
}

export function requireCurrentSession(event: Pick<RequestEvent, 'request'>) {
	return getCurrentSession(event).then(requireSessionValue);
}

export function requireSessionValue<T>(session: T | null): T {
	if (!session) throw new Error('Unauthorized');
	return session;
}
