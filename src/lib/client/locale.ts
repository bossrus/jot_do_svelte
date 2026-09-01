import { browser } from '$app/environment';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { writable } from 'svelte/store';

export const locales = ['ru', 'en', 'es'] as const;
export type AppLocale = (typeof locales)[number];
export const LOCALE_STORAGE_KEY = 'quick-todo.locale';
export const localeVersion = writable(0);
export const localeState = writable<AppLocale>('en');
let activeLocale: AppLocale = 'en';
overwriteGetLocale(() => activeLocale);

function supported(value: string | null | undefined): AppLocale | null {
	const base = value?.toLowerCase().split('-')[0];
	return locales.find((locale) => locale === base) ?? null;
}

export function detectLocale(
	storage: Pick<Storage, 'getItem'>,
	browserLocales?: string | readonly string[]
): AppLocale {
	const detected = (typeof browserLocales === 'string' ? [browserLocales] : browserLocales)?.find(
		(value) => supported(value) !== null
	);
	return supported(storage.getItem(LOCALE_STORAGE_KEY)) ?? supported(detected) ?? 'en';
}

export function initializeLocale(): AppLocale {
	if (!browser) return 'en';
	const locale = detectLocale(
		localStorage,
		navigator.languages?.length ? navigator.languages : navigator.language
	);
	activeLocale = locale;
	localeState.set(locale);
	localeVersion.update((value) => value + 1);
	document.documentElement.lang = locale;
	return locale;
}

export function changeLocale(locale: AppLocale) {
	if (!locales.includes(locale)) return;
	activeLocale = locale;
	localeState.set(locale);
	localeVersion.update((value) => value + 1);
	if (browser) {
		localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		document.documentElement.lang = locale;
	}
}

export function currentLocale(): AppLocale {
	return activeLocale;
}
