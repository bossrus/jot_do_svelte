import { z } from 'zod';

export const recurringScheduleSchema = z.discriminatedUnion('frequency', [
	z.strictObject({
		frequency: z.literal('daily'),
		localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		timezone: z.string().min(1).max(100)
	}),
	z.strictObject({
		frequency: z.literal('weekdays'),
		weekdays: z.array(z.int().min(1).max(7)).min(1).max(7),
		localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		timezone: z.string().min(1).max(100)
	}),
	z.strictObject({
		frequency: z.literal('interval_days'),
		interval: z.int().min(1).max(365),
		localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		timezone: z.string().min(1).max(100)
	}),
	z.strictObject({
		frequency: z.literal('interval_weeks'),
		interval: z.int().min(1).max(52),
		localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		timezone: z.string().min(1).max(100)
	}),
	z.strictObject({
		frequency: z.literal('monthly'),
		monthDay: z.int().min(1).max(31),
		localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		timezone: z.string().min(1).max(100)
	})
]);
export const recurringMutationSchema = z.strictObject({
	enabled: z.boolean().default(true),
	schedule: recurringScheduleSchema,
	userIds: z.array(z.uuid()).max(1000).optional(),
	groupIds: z.array(z.uuid()).max(1000).optional()
});
export const recurringCreateSchema = recurringMutationSchema.extend({
	todoId: z.uuid()
});
export type RecurringSchedule = z.infer<typeof recurringScheduleSchema>;
