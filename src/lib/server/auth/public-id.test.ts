import { describe, expect, it } from 'vitest';
import { generatePublicId } from './public-id';

describe('generatePublicId', () => {
	it('creates a shareable non-sequential identifier', () => {
		expect(generatePublicId((size) => new Uint8Array(size).fill(3))).toMatch(
			/^QT-[23456789A-HJ-NP-Z]{8}$/
		);
	});
	it('uses supplied secure random bytes', () => {
		expect(generatePublicId(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('QT-23456789');
	});
});
