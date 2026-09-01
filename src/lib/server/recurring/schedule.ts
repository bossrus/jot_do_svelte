import type { RecurringSchedule } from '$lib/recurring/contracts';

type Local = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	weekday: number;
};
function localParts(date: Date, timezone: string): Local {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		weekday: 'short'
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
	return {
		year: +get('year'),
		month: +get('month'),
		day: +get('day'),
		hour: +get('hour'),
		minute: +get('minute'),
		weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1
	};
}
function toInstant(local: Omit<Local, 'weekday'>, timezone: string): Date {
	let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
	for (let i = 0; i < 4; i++) {
		const actual = localParts(new Date(guess), timezone);
		const wanted = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
		const seen = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
		if (wanted === seen) break;
		guess += wanted - seen;
	}
	return new Date(guess);
}
function addDays(local: Local, days: number): Local {
	const d = new Date(
		Date.UTC(local.year, local.month - 1, local.day + days, local.hour, local.minute)
	);
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		hour: local.hour,
		minute: local.minute,
		weekday: ((local.weekday - 1 + days) % 7) + 1
	};
}
export function nextRunAt(schedule: RecurringSchedule, after: Date): Date {
	// Validate IANA timezone eagerly.
	new Intl.DateTimeFormat('en', { timeZone: schedule.timezone });
	const [hour, minute] = schedule.localTime.split(':').map(Number);
	const current = localParts(after, schedule.timezone);
	let candidate: Local = { ...current, hour, minute };
	const candidateInstant = () => toInstant(candidate, schedule.timezone);
	if (schedule.frequency === 'monthly') {
		for (let offset = 0; offset < 24; offset++) {
			const base = new Date(Date.UTC(current.year, current.month - 1 + offset, 1));
			const last = new Date(
				Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
			).getUTCDate();
			candidate = {
				year: base.getUTCFullYear(),
				month: base.getUTCMonth() + 1,
				day: Math.min(schedule.monthDay, last),
				hour,
				minute,
				weekday: 1
			};
			if (candidateInstant() > after) return candidateInstant();
		}
	} else if (schedule.frequency === 'weekdays') {
		for (let days = 0; days <= 14; days++) {
			candidate = { ...addDays(current, days), hour, minute };
			if (schedule.weekdays.includes(candidate.weekday) && candidateInstant() > after)
				return candidateInstant();
		}
	} else {
		const step =
			schedule.frequency === 'interval_weeks'
				? schedule.interval * 7
				: schedule.frequency === 'interval_days'
					? schedule.interval
					: 1;
		if (candidateInstant() <= after) candidate = { ...addDays(candidate, step), hour, minute };
		return candidateInstant();
	}
	throw new Error('Unable to calculate next recurring run');
}

export function selectMissedOccurrence(dueAt: Date, now: Date) {
	return { scheduledFor: dueAt, nextAfter: dueAt > now ? now : dueAt };
}
