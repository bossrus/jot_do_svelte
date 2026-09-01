import { describe, expect, it } from 'vitest';
import { forgotPasswordSuccess, validateEmail, validatePassword } from './validation';

describe('auth validation', () => {
	it('requires a reasonable password length', () =>
		expect(validatePassword('short', 'short')).toContain('8'));
	it('requires matching confirmation', () =>
		expect(validatePassword('longpassword', 'different')).toContain('do not match'));
	it('accepts matching passwords', () =>
		expect(validatePassword('longpassword', 'longpassword')).toBeNull());
	it('validates email shape', () => {
		expect(validateEmail('wrong')).toBeTruthy();
		expect(validateEmail('a@b.test')).toBeNull();
	});
	it('uses the same neutral forgot-password response', () =>
		expect(forgotPasswordSuccess()).not.toMatch(/does not exist|not found/i));
});
