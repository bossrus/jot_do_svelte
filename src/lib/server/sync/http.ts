import { error, json, type RequestEvent } from '@sveltejs/kit';
import { cloudPermission } from '$lib/server/permissions/sync';
import { SyncError } from './errors';

export function requireSyncUser(event: Pick<RequestEvent, 'locals'>) {
	const user = event.locals.user;
	if (!user) error(401, { message: 'Unauthenticated' });
	const permission = cloudPermission({
		plan: user.plan,
		emailVerified: user.emailVerified
	});
	if (permission === 'email_not_verified') return error(403, { message: 'EMAIL_NOT_VERIFIED' });
	if (permission === 'plan_required') return error(403, { message: 'PLAN_REQUIRED' });
	return user;
}

export function mapSyncError(cause: unknown): Response {
	if (cause instanceof SyncError) {
		if (cause.code === 'REVISION_CONFLICT')
			return json({ code: cause.code, serverRevision: cause.serverRevision ?? 0 }, { status: 409 });
		if (cause.code === 'INVALID_STORAGE_KEY') return json({ code: cause.code }, { status: 400 });
		return json({ code: cause.code }, { status: 404 });
	}
	throw cause;
}
