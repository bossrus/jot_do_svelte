import { createAuthClient } from 'better-auth/svelte';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '$lib/server/auth';
import { m } from '$lib/paraglide/messages';
import { currentLocale } from '$lib/client/locale';

export const authClient = createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] });
export const session = authClient.useSession();

function verificationCallbackURL() {
	return `/verify-email?locale=${currentLocale()}`;
}

export const authService = {
	signIn(email: string, password: string) {
		return authClient.signIn.email({ email, password });
	},
	signUp(name: string, email: string, password: string) {
		return authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: verificationCallbackURL()
		});
	},
	resendVerification(email: string) {
		return authClient.sendVerificationEmail({ email, callbackURL: verificationCallbackURL() });
	},
	refreshSession() {
		return session.get().refetch();
	},
	signOut() {
		return authClient.signOut();
	},
	requestPasswordReset(email: string) {
		return authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
	},
	resetPassword(newPassword: string, token: string) {
		return authClient.resetPassword({ newPassword, token });
	},
	changePassword(currentPassword: string, newPassword: string) {
		return authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions: true
		});
	},
	updateName(name: string) {
		return authClient.updateUser({ name });
	},
	async changeEmail(newEmail: string) {
		const response = await fetch('/api/account/email', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: newEmail })
		});
		if (!response.ok) {
			await response.json().catch(() => ({}));
			return { error: { message: m.email_change_failed() } };
		}
		await session.get().refetch();
		return authClient.sendVerificationEmail({
			email: newEmail,
			callbackURL: verificationCallbackURL()
		});
	}
};
