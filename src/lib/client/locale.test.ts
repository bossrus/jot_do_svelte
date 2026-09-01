import { describe, expect, it } from 'vitest';
import { changeLocale, detectLocale } from './locale';
import { m } from '$lib/paraglide/messages';

const storage = (value: string | null) => ({ getItem: () => value });
describe('detectLocale', () => {
	it.each([
		['ru-RU', 'ru'],
		['en-US', 'en'],
		['es-ES', 'es'],
		['de-DE', 'en']
	])('detects %s', (input, expected) => expect(detectLocale(storage(null), input)).toBe(expected));
	it('prefers a supported saved locale', () =>
		expect(detectLocale(storage('es'), 'ru-RU')).toBe('es'));
	it('ignores an unsupported saved locale', () =>
		expect(detectLocale(storage('xx'), 'ru-RU')).toBe('ru'));
	it('uses the first supported language from the browser preference list', () =>
		expect(detectLocale(storage(null), ['de-DE', 'es-ES', 'en-US'])).toBe('es'));
	it('switches Paraglide messages immediately', () => {
		changeLocale('en');
		expect(m.settings()).toBe('Settings');
		changeLocale('es');
		expect(m.settings()).toBe('Ajustes');
		changeLocale('ru');
		expect(m.settings()).toBe('Настройки');
	});
});
