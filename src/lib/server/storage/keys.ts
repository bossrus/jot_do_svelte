import { randomUUID } from 'node:crypto';

export function createStorageKey(prefix: string, extension?: string): string {
	const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
	const normalizedExtension = extension?.replace(/^\./, '');
	return `${normalizedPrefix}/${randomUUID()}${normalizedExtension ? `.${normalizedExtension}` : ''}`;
}
