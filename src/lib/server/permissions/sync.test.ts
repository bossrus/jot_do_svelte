import { describe, expect, it } from 'vitest';
import { canSync, cloudPermission } from './sync';

describe('canSync', () => {
	it.each([
		['free', false],
		['cloud', true],
		['join', true],
		['share', true],
		['group', true]
	] as const)('%s => %s', (plan, expected) => {
		expect(canSync({ plan, emailVerified: true })).toBe(expected);
	});

	it.each(['free', 'cloud', 'join', 'share', 'group'] as const)(
		'blocks unverified %s users before checking the plan',
		(plan) => {
			expect(cloudPermission({ plan, emailVerified: false })).toBe('email_not_verified');
			expect(canSync({ plan, emailVerified: false })).toBe(false);
		}
	);

	it('distinguishes plan gating from email gating', () => {
		expect(cloudPermission({ plan: 'free', emailVerified: true })).toBe('plan_required');
		expect(cloudPermission({ plan: 'cloud', emailVerified: true })).toBe('allowed');
	});
});
