import { error, type RequestEvent } from '@sveltejs/kit';
import { getPlanCapabilities, isUserPlan, type PlanCapabilities } from '$lib/billing/plans';

export type PlanCapability = keyof PlanCapabilities;

export function hasPlanCapability(plan: unknown, capability: PlanCapability): boolean {
	return isUserPlan(plan) && getPlanCapabilities(plan)[capability];
}

export function requirePlanCapability(
	event: Pick<RequestEvent, 'locals'>,
	capability: PlanCapability
) {
	const user = event.locals.user;
	if (!user) error(401, { message: 'Unauthenticated' });
	if (!hasPlanCapability(user.plan, capability)) error(403, { message: 'PLAN_REQUIRED' });
	return user;
}
