import { describe, expect, it } from 'vitest';
import { getPlanCapabilities, getPlanRank, isPaidPlan, isUserPlan, USER_PLANS } from './plans';

describe('billing plans', () => {
	it('keeps the public plan set centralized', () => {
		expect(USER_PLANS).toEqual(['free', 'cloud', 'join', 'share', 'group']);
		expect(isUserPlan('group')).toBe(true);
	});

	it('grants cloud capabilities only to paid plans', () => {
		expect(getPlanCapabilities('free')).toEqual({
			canSync: false,
			canJoinSharedTodo: false,
			canShareTodo: false,
			canManageGroups: false,
			canUseRecurringTodos: false
		});
		for (const plan of ['cloud', 'join', 'share', 'group'] as const) {
			expect(getPlanCapabilities(plan).canSync).toBe(true);
			expect(getPlanCapabilities(plan).canUseRecurringTodos).toBe(true);
			expect(isPaidPlan(plan)).toBe(true);
		}
		expect(getPlanCapabilities('join').canJoinSharedTodo).toBe(true);
		expect(getPlanCapabilities('share').canShareTodo).toBe(true);
		expect(getPlanCapabilities('group').canManageGroups).toBe(true);
		expect(isPaidPlan('free')).toBe(false);
		expect(isPaidPlan('anything')).toBe(false);
	});

	it('orders plans from free to group for downgrade protection', () => {
		expect(USER_PLANS.map(getPlanRank)).toEqual([0, 1, 2, 3, 4]);
		expect(getPlanRank('join')).toBeLessThan(getPlanRank('share'));
	});
});
