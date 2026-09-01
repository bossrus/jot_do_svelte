export const USER_PLANS = ['free', 'cloud', 'join', 'share', 'group'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const PAID_PLANS = [
	'cloud',
	'join',
	'share',
	'group'
] as const satisfies readonly UserPlan[];
export type PaidPlan = (typeof PAID_PLANS)[number];

export type PlanCapabilities = {
	canSync: boolean;
	canJoinSharedTodo: boolean;
	canShareTodo: boolean;
	canManageGroups: boolean;
	canUseRecurringTodos: boolean;
};

export type PlanDefinition = {
	label: string;
	capabilities: PlanCapabilities;
};

// Temporary prices live here until a payment provider becomes the source of truth.
export const PLAN_DEFINITIONS: Record<UserPlan, PlanDefinition> = {
	free: {
		label: 'Free',
		capabilities: {
			canSync: false,
			canJoinSharedTodo: false,
			canShareTodo: false,
			canManageGroups: false,
			canUseRecurringTodos: false
		}
	},
	cloud: {
		label: 'Cloud',
		capabilities: {
			canSync: true,
			canJoinSharedTodo: false,
			canShareTodo: false,
			canManageGroups: false,
			canUseRecurringTodos: true
		}
	},
	join: {
		label: 'Join',
		capabilities: {
			canSync: true,
			canJoinSharedTodo: true,
			canShareTodo: false,
			canManageGroups: false,
			canUseRecurringTodos: true
		}
	},
	share: {
		label: 'Share',
		capabilities: {
			canSync: true,
			canJoinSharedTodo: true,
			canShareTodo: true,
			canManageGroups: false,
			canUseRecurringTodos: true
		}
	},
	group: {
		label: 'Group',
		capabilities: {
			canSync: true,
			canJoinSharedTodo: true,
			canShareTodo: true,
			canManageGroups: true,
			canUseRecurringTodos: true
		}
	}
};

export function isUserPlan(value: unknown): value is UserPlan {
	return typeof value === 'string' && USER_PLANS.includes(value as UserPlan);
}

export function isPaidPlan(value: unknown): value is PaidPlan {
	return typeof value === 'string' && PAID_PLANS.includes(value as PaidPlan);
}

export function getPlanRank(plan: UserPlan): number {
	return USER_PLANS.indexOf(plan);
}

export function getPlanCapabilities(plan: UserPlan): PlanCapabilities {
	return PLAN_DEFINITIONS[plan].capabilities;
}
