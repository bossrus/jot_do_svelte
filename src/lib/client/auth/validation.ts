import { m } from '$lib/paraglide/messages';

export function validatePassword(password: string, confirmation: string): string | null {
	if (password.length < 8) return m.password_min();
	if (password !== confirmation) return m.password_mismatch();
	return null;
}

export function validateEmail(email: string): string | null {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : m.email_invalid();
}

export function forgotPasswordSuccess() {
	return m.forgot_password_success();
}
