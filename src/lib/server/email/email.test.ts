import { describe, expect, it } from 'vitest';
import { createVerificationEmail, readMailConfig, verificationMailLocale } from './index';

describe('mail configuration', () => {
	it('rejects incomplete authentication credentials', () =>
		expect(() =>
			readMailConfig({
				SMTP_HOST: 'smtp',
				SMTP_PORT: '2525',
				SMTP_FROM: 'sender@example.com',
				SMTP_USER: 'u'
			})
		).toThrow());
	it('parses a local SMTP configuration without authentication', () =>
		expect(
			readMailConfig({
				SMTP_HOST: '127.0.0.1',
				SMTP_PORT: '25',
				SMTP_SECURE: 'false',
				SMTP_FROM: 'Quick Todo <no-reply@example.com>'
			})
		).toEqual({
			host: '127.0.0.1',
			port: 25,
			secure: false,
			from: 'Quick Todo <no-reply@example.com>'
		}));
	it('parses authenticated SMTP', () =>
		expect(
			readMailConfig({
				SMTP_HOST: 'smtp',
				SMTP_PORT: '465',
				SMTP_SECURE: 'true',
				SMTP_FROM: 'sender@example.com',
				SMTP_USER: 'u',
				SMTP_PASSWORD: 'p'
			})
		).toEqual({
			host: 'smtp',
			port: 465,
			secure: true,
			from: 'sender@example.com',
			auth: { user: 'u', pass: 'p' }
		}));
});

describe('verification email', () => {
	it.each([
		['ru', 'Подтвердите email для JotDo'],
		['en', 'Confirm your email for JotDo'],
		['es', 'Confirma tu correo para JotDo']
	] as const)('renders the %s version', (locale, subject) => {
		const message = createVerificationEmail('https://jotdo.site/verify?token=a&next=b', locale);
		expect(message.subject).toBe(subject);
		expect(message.html).toContain('Jot<span');
		expect(message.html).toContain('token=a&amp;next=b');
		expect(message.text).toContain('https://jotdo.site/about');
		expect(message.text).not.toContain('Quick Todo');
	});

	it('reads the app locale from the verification callback', () => {
		const url =
			'https://jotdo.site/api/auth/verify-email?token=x&callbackURL=%2Fverify-email%3Flocale%3Des';
		expect(verificationMailLocale(url)).toBe('es');
	});

	it('falls back to the first supported Accept-Language value', () => {
		const request = new Request('https://jotdo.site', {
			headers: { 'accept-language': 'de-DE,de;q=0.9,ru-RU;q=0.8' }
		});
		expect(verificationMailLocale('https://jotdo.site/verify', request)).toBe('ru');
	});
});
