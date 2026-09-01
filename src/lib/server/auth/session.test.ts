import { describe, expect, it } from 'vitest';
import { requireSessionValue } from './session';

describe('session helper', () => {
	it('returns an authenticated session', () =>
		expect(requireSessionValue({ user: { id: '1' } })).toEqual({ user: { id: '1' } }));
	it('rejects an anonymous request', () =>
		expect(() => requireSessionValue(null)).toThrow('Unauthorized'));
});
