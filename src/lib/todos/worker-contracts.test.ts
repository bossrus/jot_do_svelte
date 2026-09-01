import { describe, expect, it } from 'vitest';
import { workerActionSchema } from './worker-contracts';

const userId = '10000000-0000-4000-8000-000000000001';

describe('worker action contract', () => {
	it.each(['join', 'complete', 'resume', 'leave'] as const)('accepts self action %s', (action) => {
		expect(workerActionSchema.safeParse({ action }).success).toBe(true);
	});
	it.each(['assign', 'remove'] as const)('requires a target for %s', (action) => {
		expect(workerActionSchema.safeParse({ action }).success).toBe(false);
		expect(workerActionSchema.safeParse({ action, targetUserId: userId }).success).toBe(true);
	});
	it('rejects a target on self actions', () => {
		expect(workerActionSchema.safeParse({ action: 'join', targetUserId: userId }).success).toBe(
			false
		);
	});
});
