import { describe, expect, it } from 'vitest';
import { getPaddleJsEnvironment } from './paddle-client';

describe('Paddle.js environment', () => {
	it('uses sandbox for test tokens', () => {
		expect(getPaddleJsEnvironment('test_example')).toBe('sandbox');
	});

	it('uses production for live tokens', () => {
		expect(getPaddleJsEnvironment('live_example')).toBe('production');
	});
});
