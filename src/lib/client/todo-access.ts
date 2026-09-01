import { m } from '$lib/paraglide/messages';

export function todoAccessErrorMessage(code: unknown, action: 'load' | 'grant' | 'revoke'): string {
	if (code === 'USER_NOT_FOUND') return m.access_user_not_found();
	if (code === 'CANNOT_SHARE_WITH_SELF') return m.access_cannot_self();
	if (code === 'INVALID_PARTICIPANTS') return m.access_invalid_participants();
	if (code === 'VALIDATION_ERROR') return m.email_invalid();
	if (action === 'load') return m.access_load_failed();
	if (action === 'revoke') return m.access_revoke_failed();
	return m.access_grant_failed();
}
