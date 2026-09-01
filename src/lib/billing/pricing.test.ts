import { describe, expect, it } from 'vitest';
import {
	formatUsd,
	getBillingPeriodRank,
	getMonthlyEquivalentCents,
	getPeriodEnd,
	getPeriodPriceCents
} from './pricing';

describe('billing pricing', () => {
	it('uses the Paddle USD catalog prices', () => {
		expect(getPeriodPriceCents('cloud', 'month')).toBe(199);
		expect(getPeriodPriceCents('cloud', 'year')).toBe(2299);
		expect(getPeriodPriceCents('cloud', 'five-years')).toBe(11399);
		expect(getPeriodPriceCents('join', 'five-years')).toBe(17399);
		expect(getPeriodPriceCents('share', 'five-years')).toBe(23399);
		expect(getPeriodPriceCents('group', 'five-years')).toBe(29399);
		expect(getMonthlyEquivalentCents('cloud', 'year')).toBe(192);
		expect(formatUsd(2299)).toBe('$22.99');
	});

	it('calculates local period end dates for webhook state', () => {
		const start = new Date('2026-01-15T00:00:00.000Z');
		expect(getPeriodEnd(start, 'month').toISOString()).toBe('2026-02-15T00:00:00.000Z');
		expect(getPeriodEnd(start, 'year').toISOString()).toBe('2027-01-15T00:00:00.000Z');
		expect(getPeriodEnd(start, 'five-years').toISOString()).toBe('2031-01-15T00:00:00.000Z');
	});

	it('orders billing periods by their paid duration', () => {
		expect((['month', 'year', 'five-years'] as const).map(getBillingPeriodRank)).toEqual([
			1, 12, 60
		]);
	});
});
