import { getPlanCapabilities, isUserPlan, type UserPlan } from '$lib/billing/plans';

export type CloudPermission = 'allowed' | 'email_not_verified' | 'plan_required';

export function cloudPermission(user: { plan: unknown; emailVerified: boolean }): CloudPermission {
	if (!user.emailVerified) return 'email_not_verified';
	return isUserPlan(user.plan) && getPlanCapabilities(user.plan).canSync
		? 'allowed'
		: 'plan_required';
}

export function canSync(user: { plan: UserPlan; emailVerified: boolean }): boolean {
	return cloudPermission(user) === 'allowed';
}
