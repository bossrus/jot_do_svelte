import { describe, expect, it } from 'vitest';
import { isImportableImage } from './images';

describe('image import MIME restriction', () => {
	it.each(['image/jpeg', 'image/png', 'image/webp'])('allows %s', (type) => {
		expect(isImportableImage({ type })).toBe(true);
	});

	it.each(['image/gif', 'image/svg+xml', 'image/avif', 'application/octet-stream', ''])(
		'rejects %s',
		(type) => expect(isImportableImage({ type })).toBe(false)
	);
});
