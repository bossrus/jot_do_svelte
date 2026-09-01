import { describe, expect, it } from 'vitest';
import { readMaxImageSizeBytes } from './config';

describe('image configuration', () => {
	it.each([undefined, '', 'nope', '0', '-1', '1.5'])(
		'rejects invalid MAX_IMAGE_SIZE_BYTES=%s',
		(value) => {
			expect(() => readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: value })).toThrow(
				'Invalid server configuration'
			);
		}
	);

	it('accepts a positive safe integer', () => {
		expect(readMaxImageSizeBytes({ MAX_IMAGE_SIZE_BYTES: '10485760' })).toBe(10_485_760);
	});
});
