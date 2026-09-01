import { browser } from '$app/environment';

export const themes = ['system', 'light', 'dark'] as const;
export type AppTheme = (typeof themes)[number];
export const THEME_STORAGE_KEY = 'quick-todo.theme';
let listener: (() => void) | undefined;

export function readTheme(): AppTheme {
	if (!browser) return 'system';
	const value = localStorage.getItem(THEME_STORAGE_KEY);
	return themes.includes(value as AppTheme) ? (value as AppTheme) : 'system';
}

function apply(theme: AppTheme) {
	const dark =
		theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.dataset.theme = dark ? 'dark' : 'light';
	document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function initializeTheme() {
	if (!browser) return () => {};
	const media = matchMedia('(prefers-color-scheme: dark)');
	listener = () => readTheme() === 'system' && apply('system');
	media.addEventListener('change', listener);
	apply(readTheme());
	return () => listener && media.removeEventListener('change', listener);
}

export function changeTheme(theme: AppTheme) {
	if (!browser || !themes.includes(theme)) return;
	localStorage.setItem(THEME_STORAGE_KEY, theme);
	apply(theme);
}
