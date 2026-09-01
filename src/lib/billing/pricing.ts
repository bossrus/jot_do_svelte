import type { PaidPlan } from './plans';

export const BILLING_PERIODS = {
	month: { label: 'Помесячно', months: 1 },
	year: { label: 'За год', months: 12 },
	'five-years': { label: 'За 5 лет', months: 60 }
} as const;

export type BillingPeriod = keyof typeof BILLING_PERIODS;

export const PLAN_PRICES_USD_CENTS: Record<PaidPlan, Record<BillingPeriod, number>> = {
	cloud: { month: 199, year: 2299, 'five-years': 11399 },
	join: { month: 299, year: 3499, 'five-years': 17399 },
	share: { month: 399, year: 4699, 'five-years': 23399 },
	group: { month: 499, year: 5899, 'five-years': 29399 }
};

export function isBillingPeriod(value: unknown): value is BillingPeriod {
	return typeof value === 'string' && value in BILLING_PERIODS;
}

export function getBillingPeriodRank(period: BillingPeriod): number {
	return BILLING_PERIODS[period].months;
}

export function getPeriodPriceCents(plan: PaidPlan, period: BillingPeriod): number {
	return PLAN_PRICES_USD_CENTS[plan][period];
}

export function getMonthlyEquivalentCents(plan: PaidPlan, period: BillingPeriod): number {
	return Math.round(getPeriodPriceCents(plan, period) / BILLING_PERIODS[period].months);
}

export function formatUsd(cents: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function getPeriodEnd(start: Date, period: BillingPeriod): Date {
	const end = new Date(start);
	end.setMonth(end.getMonth() + BILLING_PERIODS[period].months);
	return end;
}
