import { describe, expect, it, vi } from 'vitest';
import { createLazyRecurringScheduler, RECURRING_CHECK_INTERVAL_MS } from './lazy-scheduler';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('lazy recurring scheduler', () => {
	it('runs on first activity and not more often than the interval', async () => {
		let now = 10;
		const run = vi.fn().mockResolvedValue(undefined);
		const scheduler = createLazyRecurringScheduler(run, () => now);
		expect(scheduler.maybeRun()).toBe(true);
		await flush();
		expect(scheduler.maybeRun()).toBe(false);
		now += RECURRING_CHECK_INTERVAL_MS;
		expect(scheduler.maybeRun()).toBe(true);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('coalesces concurrent activity and resets after success', async () => {
		let resolve!: () => void;
		const run = vi.fn(() => new Promise<void>((done) => (resolve = done)));
		const scheduler = createLazyRecurringScheduler(run, () => 100_000);
		expect(scheduler.maybeRun()).toBe(true);
		expect(scheduler.maybeRun()).toBe(false);
		expect(scheduler.state().runInProgress).toBe(true);
		resolve();
		await flush();
		expect(scheduler.state().runInProgress).toBe(false);
	});

	it('handles errors, logs them and always resets without an unhandled rejection', async () => {
		const log = vi.fn();
		const scheduler = createLazyRecurringScheduler(
			() => Promise.reject(new Error('boom')),
			() => 100_000,
			log
		);
		expect(scheduler.maybeRun()).toBe(true);
		await flush();
		expect(log).toHaveBeenCalledOnce();
		expect(scheduler.state().runInProgress).toBe(false);
	});
});
