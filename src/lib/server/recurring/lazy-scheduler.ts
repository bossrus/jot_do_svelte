import { recurringService } from './service';
import { hasR2Configuration } from '$lib/server/storage/r2';

export const RECURRING_CHECK_INTERVAL_MS = 60_000;

export function createLazyRecurringScheduler(
	run: () => Promise<unknown> = () =>
		hasR2Configuration()
			? recurringService.runDue()
			: Promise.resolve({ created: 0, processed: 0 }),
	now: () => number = Date.now,
	logError: (message: string, error: unknown) => void = console.error
) {
	let lastRunAt: number | null = null;
	let runInProgress = false;

	function maybeRun() {
		const current = now();
		if (runInProgress || (lastRunAt !== null && current - lastRunAt < RECURRING_CHECK_INTERVAL_MS))
			return false;
		lastRunAt = current;
		runInProgress = true;
		void run()
			.catch((error) => logError('Lazy recurring check failed', error))
			.finally(() => {
				runInProgress = false;
			});
		return true;
	}

	return { maybeRun, state: () => ({ lastRunAt, runInProgress }) };
}

export const lazyRecurringScheduler = createLazyRecurringScheduler();
