import { describe, expect, it } from 'vitest';
import { nextRunAt } from './schedule';
describe('recurring schedule', () => {
	it('keeps local time across a timezone', () =>
		expect(
			nextRunAt(
				{ frequency: 'daily', localTime: '09:00', timezone: 'Asia/Bishkek' },
				new Date('2026-08-21T04:00:00Z')
			).toISOString()
		).toBe('2026-08-22T03:00:00.000Z'));
	it('supports multiple weekdays', () =>
		expect(
			nextRunAt(
				{ frequency: 'weekdays', weekdays: [1, 3, 5], localTime: '09:00', timezone: 'UTC' },
				new Date('2026-08-21T10:00:00Z')
			).toISOString()
		).toBe('2026-08-24T09:00:00.000Z'));
	it('clamps monthly day', () =>
		expect(
			nextRunAt(
				{ frequency: 'monthly', monthDay: 31, localTime: '10:00', timezone: 'UTC' },
				new Date('2026-09-01T00:00:00Z')
			).toISOString()
		).toBe('2026-09-30T10:00:00.000Z'));
});
